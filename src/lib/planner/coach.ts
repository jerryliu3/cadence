import { z } from "zod";
import type { Goal } from "@/lib/goals/types";
import type { GoalAssessment } from "@/lib/planner/assessment";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import { enumerateMonthsInWindow } from "@/lib/planner/dates";

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
const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((month) => {
    const monthNumber = Number(month.slice(5, 7));
    return monthNumber >= 1 && monthNumber <= 12;
  });
const monthlyDistributionEntrySchema = z
  .object({
    month: monthSchema,
    count: z.number().int().nonnegative(),
  })
  .strict();
const datePreferenceSchema = z
  .object({
    start: z.iso.date(),
    end: z.iso.date(),
    effect: z.enum(["avoid", "prefer"]),
  })
  .strict()
  .refine((preference) => preference.start <= preference.end);
const calendarIntentGlobalSchema = z
  .object({
    restWeekdays: weekdayArraySchema,
    spacingStrategy: z.enum(["unchanged", "front_load", "even", "flexible"]),
    datePreferences: z.array(datePreferenceSchema).max(20),
  })
  .strict();
const calendarIntentGoalSchema = z
  .object({
    targetGoalId: z.string().trim().max(100),
    allowedWeekdays: weekdayArraySchema,
    spacingStrategy: z.enum(["unchanged", "front_load", "even", "flexible"]),
    datePreferences: z.array(datePreferenceSchema).max(20),
    monthlyDistribution: z.array(monthlyDistributionEntrySchema).max(36),
    clearMonthlyDistribution: z.boolean().optional(),
  })
  .strict();
const calendarIntentV2Schema = z
  .object({
    action: z.enum(["none", "needs_goal", "apply"]),
    global: calendarIntentGlobalSchema.nullable(),
    goals: z.array(calendarIntentGoalSchema).max(20),
  })
  .strict();
const calendarIntentLegacySchema = z
  .object({
    action: z.enum(["none", "needs_goal", "apply_to_goal", "apply_globally"]),
    targetGoalId: z.string().trim().max(100),
    allowedWeekdays: weekdayArraySchema,
    restWeekdays: weekdayArraySchema,
    spacingStrategy: z.enum(["unchanged", "front_load", "even", "flexible"]),
    datePreferences: z.array(datePreferenceSchema).max(20),
  })
  .strict();
const calendarIntentSchema = z.union([
  calendarIntentV2Schema,
  calendarIntentLegacySchema,
]);

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
  z
    .object({
      kind: z.literal("set_goal_monthly_distribution"),
      goalId: z.uuid(),
      distribution: z.array(monthlyDistributionEntrySchema).max(36),
    })
    .strict(),
  z
    .object({
      kind: z.literal("clear_goal_monthly_distribution"),
      goalId: z.uuid(),
    })
    .strict(),
]);

function dedupeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((left, right) => left - right);
}

function dedupeMonthDistribution(
  entries: Array<{ month: string; count: number }>
) {
  const countByMonth = new Map<string, number>();
  for (const entry of entries) {
    if (entry.count <= 0) {
      continue;
    }
    countByMonth.set(
      entry.month,
      (countByMonth.get(entry.month) ?? 0) + entry.count
    );
  }
  return Array.from(countByMonth.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((left, right) => compareCanonicalStrings(left.month, right.month));
}

function resolveGoalTargetCount(goal: Goal) {
  if (goal.frequency_type === "fixed_milestones") {
    return Math.max(1, goal.target_count ?? 0);
  }
  return goal.target_count && goal.target_count > 0 ? goal.target_count : 0;
}

function normalizeDistributionToTarget({
  distribution,
  targetCount,
}: {
  distribution: Array<{ month: string; count: number }>;
  targetCount: number;
}) {
  const total = distribution.reduce((count, entry) => count + entry.count, 0);
  if (targetCount <= 0 || total <= 0) {
    return [] as Array<{ month: string; count: number }>;
  }
  if (total === targetCount) {
    return distribution;
  }
  const normalized = distribution.map((entry) => {
    const raw = (entry.count * targetCount) / total;
    const floorCount = Math.floor(raw);
    return {
      month: entry.month,
      count: floorCount,
      fractionalRemainder: raw - floorCount,
    };
  });
  let remaining = targetCount - normalized.reduce((count, entry) => count + entry.count, 0);
  for (const candidate of [...normalized].sort((left, right) => {
    if (left.fractionalRemainder !== right.fractionalRemainder) {
      return right.fractionalRemainder - left.fractionalRemainder;
    }
    return compareCanonicalStrings(left.month, right.month);
  })) {
    if (remaining <= 0) {
      break;
    }
    const target = normalized.find((entry) => entry.month === candidate.month);
    if (!target) {
      continue;
    }
    target.count += 1;
    remaining -= 1;
  }
  return normalized
    .map(({ month, count }) => ({ month, count }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => compareCanonicalStrings(left.month, right.month));
}

function normalizeGoalMonthlyDistribution({
  goal,
  distribution,
}: {
  goal: Goal;
  distribution: Array<{ month: string; count: number }>;
}) {
  const targetCount = resolveGoalTargetCount(goal);
  if (!goal.end_date || targetCount <= 0) {
    return {
      normalized: null as Array<{ month: string; count: number }> | null,
      warnings: [
        "Skipped monthly distribution because this goal does not use an ordinal target with a bounded end date.",
      ],
    };
  }
  const lifetimeMonths = enumerateMonthsInWindow({
    start: goal.start_date,
    end: goal.end_date,
  });
  const lifetimeMonthSet = new Set(lifetimeMonths);
  const deduped = dedupeMonthDistribution(distribution);
  const bounded = deduped.filter((entry) => lifetimeMonthSet.has(entry.month));
  const warnings: string[] = [];
  if (bounded.length !== deduped.length) {
    warnings.push(
      `Dropped monthly distribution entries outside ${goal.start_date.slice(0, 7)}..${goal.end_date.slice(0, 7)}.`
    );
  }
  if (bounded.length === 0) {
    warnings.push(
      "Skipped monthly distribution because no entries remain inside this goal's lifetime."
    );
    return { normalized: null, warnings };
  }
  const normalized = normalizeDistributionToTarget({
    distribution: bounded,
    targetCount,
  });
  if (normalized.length === 0) {
    warnings.push(
      "Skipped monthly distribution because all counts normalize to zero."
    );
    return { normalized: null, warnings };
  }
  const suppliedTotal = bounded.reduce((count, entry) => count + entry.count, 0);
  if (suppliedTotal !== targetCount) {
    warnings.push(
      `Adjusted monthly distribution to match target count ${targetCount}.`
    );
  }
  return { normalized, warnings };
}

type CalendarIntentV2 = z.infer<typeof calendarIntentV2Schema>;
type CalendarIntentLegacy = z.infer<typeof calendarIntentLegacySchema>;

function normalizeCalendarIntent(
  intent: CalendarIntentV2 | CalendarIntentLegacy
): CalendarIntentV2 {
  if (intent.action === "none" || intent.action === "needs_goal") {
    return {
      action: intent.action,
      global: null,
      goals: [],
    };
  }
  if (intent.action === "apply") {
    return intent;
  }
  if (intent.action === "apply_to_goal") {
    return {
      action: "apply",
      global: null,
      goals: [
        {
          targetGoalId: intent.targetGoalId,
          allowedWeekdays: intent.allowedWeekdays,
          spacingStrategy: intent.spacingStrategy,
          datePreferences: intent.datePreferences,
          monthlyDistribution: [],
          clearMonthlyDistribution: false,
        },
      ],
    };
  }
  if (intent.action === "apply_globally") {
    return {
      action: "apply",
      global: {
        restWeekdays: intent.restWeekdays,
        spacingStrategy: intent.spacingStrategy,
        datePreferences: intent.datePreferences,
      },
      goals: [],
    };
  }
  return {
    action: "none",
    global: null,
    goals: [],
  };
}

function compileCalendarIntent(
  intent: z.infer<typeof calendarIntentSchema>,
  goalsById: Map<string, Goal>
) {
  const policyPatches: CoachPolicyPatch[] = [];
  const warnings: string[] = [];
  const normalizedIntent = normalizeCalendarIntent(intent);

  if (normalizedIntent.action === "none") {
    return { policyPatches, warnings };
  }
  if (normalizedIntent.action === "needs_goal") {
    warnings.push(
      "No calendar edits were generated because this plan does not map to an existing goal."
    );
    return { policyPatches, warnings };
  }
  if (normalizedIntent.global) {
    const restWeekdays = dedupeWeekdays(normalizedIntent.global.restWeekdays);
    if (restWeekdays.length > 0) {
      policyPatches.push({ kind: "set_rest_weekdays", restWeekdays });
    }
    if (normalizedIntent.global.spacingStrategy !== "unchanged") {
      policyPatches.push({
        kind: "set_spacing_strategy",
        spacingStrategy: normalizedIntent.global.spacingStrategy,
      });
    }
    for (const preference of normalizedIntent.global.datePreferences) {
      policyPatches.push({
        kind: "set_goal_date_preference",
        goalId: null,
        ...preference,
      });
    }
  }
  for (const goalIntent of normalizedIntent.goals) {
    const goalId = goalIntent.targetGoalId;
    const goal = goalId ? goalsById.get(goalId) : undefined;
    if (!goalId || !goal) {
      warnings.push(
        "Skipped one goal-level edit because the selected goal is not in the current planner scope."
      );
      continue;
    }
    const allowedWeekdays = dedupeWeekdays(goalIntent.allowedWeekdays);
    if (allowedWeekdays.length > 0) {
      policyPatches.push({
        kind: "set_goal_allowed_weekdays",
        goalId,
        weekdays: allowedWeekdays,
      });
    }
    if (goalIntent.spacingStrategy !== "unchanged") {
      policyPatches.push({
        kind: "set_goal_spacing_strategy",
        goalId,
        spacingStrategy: goalIntent.spacingStrategy,
      });
    }
    for (const preference of goalIntent.datePreferences) {
      policyPatches.push({
        kind: "set_goal_date_preference",
        goalId,
        ...preference,
      });
    }
    if (goalIntent.clearMonthlyDistribution) {
      policyPatches.push({
        kind: "clear_goal_monthly_distribution",
        goalId,
      });
      continue;
    }
    if (goalIntent.monthlyDistribution.length > 0) {
      const normalizedDistribution = normalizeGoalMonthlyDistribution({
        goal,
        distribution: goalIntent.monthlyDistribution,
      });
      warnings.push(...normalizedDistribution.warnings);
      if (normalizedDistribution.normalized) {
        policyPatches.push({
          kind: "set_goal_monthly_distribution",
          goalId,
          distribution: normalizedDistribution.normalized,
        });
      }
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
              type: ["object", "null"],
              properties: {
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
              required: ["restWeekdays", "spacingStrategy", "datePreferences"],
            },
            goals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  targetGoalId: { type: "string" },
                  allowedWeekdays: {
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
                  monthlyDistribution: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        month: { type: "string" },
                        count: { type: "integer", minimum: 0 },
                      },
                      required: ["month", "count"],
                    },
                  },
                  clearMonthlyDistribution: { type: "boolean" },
                },
                required: [
                  "targetGoalId",
                  "allowedWeekdays",
                  "spacingStrategy",
                  "datePreferences",
                  "monthlyDistribution",
                ],
              },
            },
          },
          required: ["action", "global", "goals"],
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
