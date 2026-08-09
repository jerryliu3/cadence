import { z } from "zod";
import type { Goal } from "@/lib/goals/types";
import type { GoalAssessment } from "@/lib/planner/assessment";
import {
  plannerDraftCommandSchema,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";

export const MAX_COACH_MESSAGES = 20;
export const MAX_COACH_FOCUS_GOALS = 20;
export const MAX_COACH_MESSAGE_CHARS = 12_000;
export const MAX_COACH_REPLY_CHARS = 12_000;
export const COACH_WARNING_NEEDS_GOAL =
  "No calendar edits were generated because this plan does not map to an existing goal.";
export const COACH_WARNING_NO_SCHEDULING_CHANGES =
  "The calendar intent did not contain any scheduling changes.";
export const COACH_WARNING_ITEM_EDIT_OUT_OF_SCOPE =
  "Some proposed item edits were skipped because they do not map to goals in this planner scope.";
export const COACH_WARNING_ITEM_EDIT_UNSUPPORTED =
  "Some proposed item edits were skipped because they were not supported.";
const COACH_NO_EDITS_SUPPORTED_REPLY =
  "No calendar edits were applied because the proposal did not contain valid policy or item-level scheduling edits.";
export const COACH_CLEAR_TIME_SENTINEL = "__clear_time__";

export const coachRequestSchema = z
  .object({
    scopeMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .refine((month) => {
        const monthNumber = Number(month.slice(5, 7));
        return monthNumber >= 1 && monthNumber <= 12;
      }),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(MAX_COACH_MESSAGE_CHARS),
          })
          .strict()
      )
      .min(1)
      .max(MAX_COACH_MESSAGES),
    focusGoalIds: z.array(z.uuid()).max(MAX_COACH_FOCUS_GOALS).default([]),
    deterministicSummary: z.string().trim().max(4000).optional(),
  })
  .strict();

const coachRecommendationPayloadSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  })
  .passthrough();
const coachRecommendationSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? { text: value } : value,
  coachRecommendationPayloadSchema
);

const weekdayArraySchema = z.array(z.number().int().min(0).max(6)).max(7);
const dateRangeSchema = z
  .object({
    start: z.iso.date(),
    end: z.iso.date(),
  })
  .strict()
  .refine((range) => range.start <= range.end);
const calendarIntentGlobalSchema = z
  .object({
    restWeekdays: weekdayArraySchema.optional().default([]),
    addBlackoutRanges: z.array(dateRangeSchema).max(20).optional().default([]),
    removeBlackoutRanges: z.array(dateRangeSchema).max(20).optional().default([]),
  })
  .strict();
const calendarIntentItemSchema = z
  .object({
    goalId: z.uuid(),
    unitKey: z.string().trim().min(1).max(200),
    scheduledDate: z.iso.date().optional(),
    label: z.string().trim().min(1).max(200).optional(),
    localTime: z.preprocess(
      (value) => {
        if (
          typeof value === "string" &&
          value.trim().toLowerCase() === COACH_CLEAR_TIME_SENTINEL
        ) {
          return null;
        }
        return value;
      },
      z
        .string()
        .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
        .nullable()
        .optional()
    ),
  })
  .strict()
  .refine(
    (value) =>
      value.scheduledDate !== undefined ||
      value.label !== undefined ||
      value.localTime !== undefined,
    "Calendar item edits must include at least one mutable field."
  );
const calendarIntentSchema = z
  .object({
    action: z.enum(["none", "needs_goal", "apply"]),
    global: calendarIntentGlobalSchema.nullable().optional().default(null),
    items: z.array(z.unknown()).max(100).default([]),
  })
  .strict();

export const coachTurnResponseSchema = z
  .object({
    schemaVersion: z.union([z.literal("1"), z.literal(1)]).transform(() => "1"),
    phase: z
      .enum(["discovery", "review", "ready", "explain"])
      .catch("review"),
    reply: z.string().trim().min(1).max(MAX_COACH_REPLY_CHARS),
    proposal: z
      .object({
        calendarIntent: calendarIntentSchema,
        unresolvedQuestions: z
          .array(z.string().trim().min(1).max(500))
          .max(20)
          .optional()
          .default([]),
      })
      .passthrough(),
    recommendations: z.array(coachRecommendationSchema).max(20).optional().default([]),
  })
  .passthrough();

export const coachPolicyPatchSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("set_rest_weekdays"),
      restWeekdays: weekdayArraySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("add_blackout_range"),
      start: z.iso.date(),
      end: z.iso.date(),
    })
    .strict()
    .refine((value) => value.start <= value.end),
  z
    .object({
      kind: z.literal("remove_blackout_range"),
      start: z.iso.date(),
      end: z.iso.date(),
    })
    .strict()
    .refine((value) => value.start <= value.end),
]);

function dedupeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((left, right) => left - right);
}

function buildCoachDraftCommandId(sequence: number) {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const suffix = sequence.toString(16).padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${suffix}`;
}

function compileCalendarItemIntents({
  items,
  goalsById,
}: {
  items: unknown[];
  goalsById: Map<string, Goal>;
}) {
  const draftCommands: PlannerDraftCommand[] = [];
  let sequence = 0;
  let outOfScopeCount = 0;
  let unsupportedCount = 0;
  const pushCommand = (command: Record<string, unknown>) => {
    sequence += 1;
    draftCommands.push(
      plannerDraftCommandSchema.parse({
        id: buildCoachDraftCommandId(sequence),
        sequence,
        ...command,
      })
    );
    return 1;
  };

  for (const rawItem of items) {
    const parsedItem = calendarIntentItemSchema.safeParse(rawItem);
    if (!parsedItem.success) {
      unsupportedCount += 1;
      continue;
    }
    const item = parsedItem.data;
    if (!goalsById.has(item.goalId)) {
      outOfScopeCount += 1;
      continue;
    }
    let compiledForItem = 0;
    if (item.scheduledDate !== undefined) {
      compiledForItem += pushCommand({
        kind: "move_item",
        goalId: item.goalId,
        unitKey: item.unitKey,
        scheduledDate: item.scheduledDate,
      });
    }
    if (item.label !== undefined) {
      compiledForItem += pushCommand({
        kind: "rename_item",
        goalId: item.goalId,
        unitKey: item.unitKey,
        label: item.label,
      });
    }
    if (item.localTime !== undefined) {
      compiledForItem +=
        item.localTime === null
          ? pushCommand({
              kind: "clear_item_time_override",
              goalId: item.goalId,
              unitKey: item.unitKey,
            })
          : pushCommand({
              kind: "set_item_time_override",
              goalId: item.goalId,
              unitKey: item.unitKey,
              localTime: item.localTime,
            });
    }
    if (compiledForItem === 0) {
      unsupportedCount += 1;
    }
  }
  return {
    draftCommands,
    outOfScopeCount,
    unsupportedCount,
  };
}

function compileCalendarIntent(
  intent: z.infer<typeof calendarIntentSchema>,
  goalsById: Map<string, Goal>
) {
  const policyPatches: CoachPolicyPatch[] = [];
  const draftCommands: PlannerDraftCommand[] = [];
  const warnings: string[] = [];
  if (intent.action === "none") {
    return { policyPatches, draftCommands, warnings };
  }
  if (intent.action === "needs_goal") {
    warnings.push(COACH_WARNING_NEEDS_GOAL);
    return { policyPatches, draftCommands, warnings };
  }

  if (intent.global) {
    const restWeekdays = dedupeWeekdays(intent.global.restWeekdays);
    if (restWeekdays.length > 0) {
      policyPatches.push({ kind: "set_rest_weekdays", restWeekdays });
    }
    for (const range of intent.global.addBlackoutRanges) {
      policyPatches.push({
        kind: "add_blackout_range",
        start: range.start,
        end: range.end,
      });
    }
    for (const range of intent.global.removeBlackoutRanges) {
      policyPatches.push({
        kind: "remove_blackout_range",
        start: range.start,
        end: range.end,
      });
    }
  }
  if (intent.items.length > 0) {
    const compiledItems = compileCalendarItemIntents({
      items: intent.items,
      goalsById,
    });
    draftCommands.push(...compiledItems.draftCommands);
    if (compiledItems.outOfScopeCount > 0) {
      warnings.push(COACH_WARNING_ITEM_EDIT_OUT_OF_SCOPE);
    }
    if (compiledItems.unsupportedCount > 0) {
      warnings.push(COACH_WARNING_ITEM_EDIT_UNSUPPORTED);
    }
  }
  if (policyPatches.length === 0 && draftCommands.length === 0) {
    warnings.push(COACH_WARNING_NO_SCHEDULING_CHANGES);
  }
  return { policyPatches, draftCommands, warnings };
}

function resolveCoachReply({
  reply,
  warnings,
  policyPatches,
  draftCommands,
}: {
  reply: string;
  warnings: string[];
  policyPatches: CoachPolicyPatch[];
  draftCommands: PlannerDraftCommand[];
}) {
  if (
    policyPatches.length > 0 ||
    draftCommands.length > 0 ||
    (!warnings.includes(COACH_WARNING_NEEDS_GOAL) &&
      !warnings.includes(COACH_WARNING_NO_SCHEDULING_CHANGES))
  ) {
    return reply;
  }
  return COACH_NO_EDITS_SUPPORTED_REPLY;
}

export type CoachPolicyPatch = z.infer<typeof coachPolicyPatchSchema>;
export type CoachRecommendation = z.infer<typeof coachRecommendationSchema>;

export interface SanitizedCoachTurn {
  schemaVersion: "1";
  phase: "discovery" | "review" | "ready" | "explain";
  reply: string;
  proposal: {
    assessments: GoalAssessment[];
    policyPatches: CoachPolicyPatch[];
    draftCommands: PlannerDraftCommand[];
    unresolvedQuestions: string[];
  };
  recommendations: CoachRecommendation[];
  warnings: string[];
}

export function sanitizeCoachTurn({
  raw,
  goalsById,
}: {
  raw: unknown;
  goalsById: Map<string, Goal>;
}): SanitizedCoachTurn {
  const parsedEnvelope = coachTurnResponseSchema.safeParse(raw);
  if (!parsedEnvelope.success) {
    throw parsedEnvelope.error;
  }
  const envelope = parsedEnvelope.data;
  const compiled = compileCalendarIntent(
    envelope.proposal.calendarIntent,
    goalsById
  );

  return {
    schemaVersion: "1",
    phase: envelope.phase,
    reply: resolveCoachReply({
      reply: envelope.reply,
      warnings: compiled.warnings,
      policyPatches: compiled.policyPatches,
      draftCommands: compiled.draftCommands,
    }),
    proposal: {
      assessments: [],
      policyPatches: compiled.policyPatches,
      draftCommands: compiled.draftCommands,
      unresolvedQuestions: envelope.proposal.unresolvedQuestions,
    },
    recommendations: envelope.recommendations,
    warnings: compiled.warnings,
  };
}

export const coachResponseJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["1"] },
    phase: {
      type: "string",
      enum: ["discovery", "review", "ready", "explain"],
    },
    reply: { type: "string" },
    proposal: {
      type: "object",
      properties: {
        calendarIntent: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["none", "needs_goal", "apply"],
            },
            global: {
              type: "object",
              properties: {
                restWeekdays: {
                  type: "array",
                  items: { type: "integer" },
                },
                addBlackoutRanges: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      start: { type: "string" },
                      end: { type: "string" },
                    },
                    required: ["start", "end"],
                  },
                },
                removeBlackoutRanges: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      start: { type: "string" },
                      end: { type: "string" },
                    },
                    required: ["start", "end"],
                  },
                },
              },
              required: [
                "restWeekdays",
                "addBlackoutRanges",
                "removeBlackoutRanges",
              ],
            },
            items: {
              type: "array",
              maxItems: 100,
              items: {
                type: "object",
                properties: {
                  goalId: { type: "string" },
                  unitKey: { type: "string" },
                  scheduledDate: { type: "string" },
                  label: { type: "string" },
                  localTime: { type: "string" },
                },
                required: ["goalId", "unitKey"],
              },
            },
          },
          required: ["action"],
        },
        unresolvedQuestions: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["calendarIntent", "unresolvedQuestions"],
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["text"],
      },
    },
  },
  required: ["schemaVersion", "phase", "reply", "proposal", "recommendations"],
} as const;
