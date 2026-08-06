import { z } from "zod";
import type { Goal } from "@/lib/goals/types";
import type { GoalAssessment } from "@/lib/planner/assessment";

export const MAX_COACH_MESSAGES = 20;
export const MAX_COACH_FOCUS_GOALS = 20;
export const MAX_COACH_MESSAGE_CHARS = 12_000;
export const MAX_COACH_REPLY_CHARS = 12_000;

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

const coachRecommendationSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  })
  .passthrough();

const weekdayArraySchema = z.array(z.number().int().min(0).max(6)).max(7);
const spacingStrategySchema = z.enum(["front_load", "even", "flexible"]);
const calendarIntentSchema = z
  .object({
    action: z.enum(["none", "needs_goal", "apply_to_goal", "apply_globally"]),
    targetGoalId: z.string().trim().max(100),
    allowedWeekdays: weekdayArraySchema,
    restWeekdays: weekdayArraySchema,
    spacingStrategy: z.enum(["unchanged", "front_load", "even", "flexible"]),
    datePreferences: z
      .array(
        z
          .object({
            start: z.iso.date(),
            end: z.iso.date(),
            effect: z.enum(["avoid", "prefer"]),
          })
          .strict()
          .refine((preference) => preference.start <= preference.end)
      )
      .max(20),
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
        unresolvedQuestions: z.array(z.string().trim().min(1).max(500)).max(20),
      })
      .passthrough(),
    recommendations: z.array(coachRecommendationSchema).max(20),
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
  z
    .object({
      kind: z.literal("set_goal_allowed_weekdays"),
      goalId: z.uuid(),
      weekdays: weekdayArraySchema.min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("clear_goal_allowed_weekdays"),
      goalId: z.uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_goal_date_preference"),
      goalId: z.uuid().nullable(),
      start: z.iso.date(),
      end: z.iso.date(),
      effect: z.enum(["avoid", "prefer"]),
    })
    .strict()
    .refine((value) => value.start <= value.end),
  z
    .object({
      kind: z.literal("clear_goal_date_preference"),
      goalId: z.uuid().nullable(),
      start: z.iso.date(),
      end: z.iso.date(),
      effect: z.enum(["avoid", "prefer"]),
    })
    .strict()
    .refine((value) => value.start <= value.end),
  z
    .object({
      kind: z.literal("set_spacing_strategy"),
      spacingStrategy: spacingStrategySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_goal_spacing_strategy"),
      goalId: z.uuid(),
      spacingStrategy: spacingStrategySchema,
    })
    .strict(),
]);

function dedupeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((left, right) => left - right);
}

function compileCalendarIntent(
  intent: z.infer<typeof calendarIntentSchema>,
  goalsById: Map<string, Goal>
) {
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

  if (intent.action === "apply_to_goal") {
    const goalId = intent.targetGoalId;
    if (!goalId || !goalsById.has(goalId)) {
      warnings.push(
        "No calendar edits were generated because the selected goal is not in the current planner scope."
      );
      return { policyPatches, warnings };
    }

    const allowedWeekdays = dedupeWeekdays(intent.allowedWeekdays);
    if (allowedWeekdays.length > 0) {
      policyPatches.push({
        kind: "set_goal_allowed_weekdays",
        goalId,
        weekdays: allowedWeekdays,
      });
    }
    if (intent.spacingStrategy !== "unchanged") {
      policyPatches.push({
        kind: "set_goal_spacing_strategy",
        goalId,
        spacingStrategy: intent.spacingStrategy,
      });
    }
    for (const preference of intent.datePreferences) {
      policyPatches.push({
        kind: "set_goal_date_preference",
        goalId,
        ...preference,
      });
    }
    if (policyPatches.length === 0) {
      warnings.push("The calendar intent did not contain any scheduling changes.");
    }
    return { policyPatches, warnings };
  }

  const restWeekdays = dedupeWeekdays(intent.restWeekdays);
  if (restWeekdays.length > 0) {
    policyPatches.push({ kind: "set_rest_weekdays", restWeekdays });
  }
  if (intent.spacingStrategy !== "unchanged") {
    policyPatches.push({
      kind: "set_spacing_strategy",
      spacingStrategy: intent.spacingStrategy,
    });
  }
  for (const preference of intent.datePreferences) {
    policyPatches.push({
      kind: "set_goal_date_preference",
      goalId: null,
      ...preference,
    });
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
              enum: ["none", "needs_goal", "apply_to_goal", "apply_globally"],
            },
            targetGoalId: { type: "string" },
            allowedWeekdays: {
              type: "array",
              items: { type: "integer", minimum: 0, maximum: 6 },
            },
            restWeekdays: {
              type: "array",
              items: { type: "integer", minimum: 0, maximum: 6 },
            },
            spacingStrategy: {
              type: "string",
              enum: ["unchanged", "front_load", "even", "flexible"],
            },
            datePreferences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  start: { type: "string" },
                  end: { type: "string" },
                  effect: { type: "string", enum: ["avoid", "prefer"] },
                },
                required: ["start", "end", "effect"],
              },
            },
          },
          required: [
            "action",
            "targetGoalId",
            "allowedWeekdays",
            "restWeekdays",
            "spacingStrategy",
            "datePreferences",
          ],
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
