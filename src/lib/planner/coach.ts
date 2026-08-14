import { z } from "zod";
import { assertDateWindow, monthFromDate } from "@/lib/planner/dates";
import type { Goal } from "@/lib/goals/types";
import type { GoalAssessment } from "@/lib/planner/assessment";

export const MAX_COACH_MESSAGES = 20;
export const MAX_COACH_FOCUS_GOALS = 20;
export const MAX_COACH_MESSAGE_CHARS = 12_000;
export const MAX_COACH_REPLY_CHARS = 12_000;

export const coachRequestSchema = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    scopeMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .refine((month) => {
        const monthNumber = Number(month.slice(5, 7));
        return monthNumber >= 1 && monthNumber <= 12;
      })
      .optional(),
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
  .strict()
  .superRefine((value, ctx) => {
    try {
      assertDateWindow({ start: value.startDate, end: value.endDate });
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid planner window.",
        path: ["endDate"],
      });
    }
  })
  .transform((value) => ({
    ...value,
    scopeMonth: value.scopeMonth ?? monthFromDate(value.startDate),
  }));

const coachRecommendationPayloadSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  })
  .passthrough();
const coachRecommendationSchema = z.preprocess(
  (value) => (typeof value === "string" ? { text: value } : value),
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
    removeBlackoutRanges: z
      .array(dateRangeSchema)
      .max(20)
      .optional()
      .default([]),
  })
  .strict();
const calendarIntentSchema = z
  .object({
    action: z.enum(["none", "needs_goal", "apply"]),
    global: calendarIntentGlobalSchema.nullable().optional().default(null),
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

function compileCalendarIntent(
  intent: z.infer<typeof calendarIntentSchema>,
  goalsById: Map<string, Goal>
) {
  void goalsById;
  const policyPatches: CoachPolicyPatch[] = [];
  const warnings: string[] = [];
  if (intent.action === "none") {
    return { policyPatches, warnings };
  }
  if (intent.action === "needs_goal") {
    warnings.push(
      "No calendar edits were generated because this plan does not map to an existing goal."
    );
    return { policyPatches, warnings };
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
  if (policyPatches.length === 0) {
    warnings.push("The calendar intent did not contain any scheduling changes.");
  }
  return { policyPatches, warnings };
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
    reply: envelope.reply,
    proposal: {
      assessments: [],
      policyPatches: compiled.policyPatches,
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
            },
          },
          required: ["action"],
        },
        unresolvedQuestions: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["calendarIntent"],
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
  required: ["schemaVersion", "phase", "reply", "proposal"],
} as const;
