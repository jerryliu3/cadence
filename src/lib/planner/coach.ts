import { z } from "zod";
import { assertDateWindow } from "@/lib/planner/dates";
import type { Goal } from "@/lib/goals/types";
import type { GoalAssessment } from "@/lib/planner/assessment";
import { MAX_COACH_FOCUS_GOALS } from "@/lib/planner/coach-constants";

export const MAX_COACH_MESSAGES = 20;
export { MAX_COACH_FOCUS_GOALS };
export const MAX_COACH_MESSAGE_CHARS = 12_000;
export const MAX_COACH_REPLY_CHARS = 12_000;
const CANONICAL_UNIT_KEY_PATTERN = /^(milestone|total|cadence):/;

export interface CoachSessionRosterEntry {
  sessionRef: string;
  goalId: string;
  goalTitle: string;
  unitKey: string;
  scheduledDate: string;
}

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
  });

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
    sessionMoves: z
      .array(
        z
          .object({
            scheduledDate: z.iso.date(),
            sessionRef: z.string().trim().min(1).max(64).optional(),
            goalId: z.uuid().optional(),
            goalRef: z.string().trim().min(1).max(200).optional(),
            unitKey: z
              .string()
              .trim()
              .min(1)
              .max(200)
              .optional()
              .refine(
                (value) =>
                  value === undefined || CANONICAL_UNIT_KEY_PATTERN.test(value),
                {
                  message:
                    "unitKey must use a canonical prefix (milestone:, total:, cadence:).",
                }
              ),
            sourceDate: z.iso.date().optional(),
          })
          .superRefine((move, ctx) => {
            if (!move.sessionRef && !move.goalId && !move.goalRef) {
              ctx.addIssue({
                code: "custom",
                message:
                  "sessionMoves[] requires at least one of sessionRef, goalId, or goalRef.",
              });
            }
          })
          .strict()
      )
      .max(50)
      .optional()
      .default([]),
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
  z
    .object({
      kind: z.literal("move_session"),
      goalId: z.uuid(),
      unitKey: z.string().trim().min(1).max(200),
      scheduledDate: z.iso.date(),
    })
    .strict(),
]);

function dedupeWeekdays(weekdays: number[]) {
  return Array.from(new Set(weekdays)).sort((left, right) => left - right);
}

function normalizeGoalReference(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resolveGoalFromReference({
  goalRef,
  goalsById,
}: {
  goalRef: string;
  goalsById: Map<string, Goal>;
}) {
  const normalizedRef = normalizeGoalReference(goalRef);
  if (!normalizedRef) {
    return { goalId: null, ambiguous: false };
  }
  const candidates = Array.from(goalsById.values()).map((goal) => ({
    goalId: goal.id,
    goalTitle: goal.title,
    normalizedTitle: normalizeGoalReference(goal.title),
  }));

  const exactMatches = candidates.filter(
    (candidate) => candidate.normalizedTitle === normalizedRef
  );
  if (exactMatches.length === 1) {
    return { goalId: exactMatches[0].goalId, ambiguous: false };
  }
  if (exactMatches.length > 1) {
    return { goalId: null, ambiguous: true };
  }

  const includesMatches = candidates.filter(
    (candidate) =>
      candidate.normalizedTitle.includes(normalizedRef) ||
      normalizedRef.includes(candidate.normalizedTitle)
  );
  if (includesMatches.length === 1) {
    return { goalId: includesMatches[0].goalId, ambiguous: false };
  }
  if (includesMatches.length > 1) {
    return { goalId: null, ambiguous: true };
  }

  const refTokens = new Set(normalizedRef.split(" ").filter(Boolean));
  const scored = candidates
    .map((candidate) => {
      const titleTokens = new Set(candidate.normalizedTitle.split(" ").filter(Boolean));
      let score = 0;
      for (const token of refTokens) {
        if (titleTokens.has(token)) {
          score += 1;
        }
      }
      return { goalId: candidate.goalId, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  if (scored.length === 0) {
    return { goalId: null, ambiguous: false };
  }
  if (
    scored.length > 1 &&
    scored[0] &&
    scored[1] &&
    scored[0].score === scored[1].score
  ) {
    return { goalId: null, ambiguous: true };
  }
  return { goalId: scored[0]?.goalId ?? null, ambiguous: false };
}

type CalendarIntentMove = z.infer<typeof calendarIntentSchema>["sessionMoves"][number];

interface SessionMoveResolutionContext {
  move: CalendarIntentMove;
  goalsById: Map<string, Goal>;
  knownGoalIds: Set<string>;
  sessionByRef: Map<string, CoachSessionRosterEntry>;
  sessionsByGoalId: Map<string, CoachSessionRosterEntry[]>;
  sessionsByGoalAndDate: Map<string, CoachSessionRosterEntry[]>;
}

interface SessionMoveResolutionResult {
  patch: CoachPolicyPatch | null;
  warning?: string;
  unresolvedQuestion?: string;
}

function resolveSessionMove({
  move,
  goalsById,
  knownGoalIds,
  sessionByRef,
  sessionsByGoalId,
  sessionsByGoalAndDate,
}: SessionMoveResolutionContext): SessionMoveResolutionResult {
  if (move.sessionRef) {
    const resolved = sessionByRef.get(move.sessionRef);
    if (!resolved) {
      return {
        patch: null,
        warning: `Ignored session move because sessionRef "${move.sessionRef}" is not available in the current calendar window.`,
        unresolvedQuestion: `Which listed session should move to ${move.scheduledDate}?`,
      };
    }
    return {
      patch: {
        kind: "move_session",
        goalId: resolved.goalId,
        unitKey: resolved.unitKey,
        scheduledDate: move.scheduledDate,
      },
    };
  }

  let resolvedGoalId: string | null = null;
  if (move.goalId && knownGoalIds.has(move.goalId)) {
    resolvedGoalId = move.goalId;
  } else if (move.goalRef) {
    const resolved = resolveGoalFromReference({
      goalRef: move.goalRef,
      goalsById,
    });
    if (resolved.ambiguous) {
      return {
        patch: null,
        warning: `Ignored session move because goal "${move.goalRef}" is ambiguous.`,
        unresolvedQuestion: `Which goal did you mean by "${move.goalRef}"?`,
      };
    }
    if (!resolved.goalId) {
      return {
        patch: null,
        warning: `Ignored session move because goal "${move.goalRef}" was not found.`,
        unresolvedQuestion: `Which goal should move to ${move.scheduledDate}?`,
      };
    }
    resolvedGoalId = resolved.goalId;
  } else if (move.goalId) {
    return {
      patch: null,
      warning: `Ignored session move for unknown goal ${move.goalId}.`,
    };
  }

  if (!resolvedGoalId) {
    return {
      patch: null,
      warning: "Ignored session move because no goal reference was provided.",
    };
  }

  const resolvedGoal = goalsById.get(resolvedGoalId);
  const resolvedGoalTitle = resolvedGoal?.title ?? "this goal";
  const sessionsForGoal = sessionsByGoalId.get(resolvedGoalId) ?? [];
  let resolvedSession: CoachSessionRosterEntry | null = null;

  if (move.unitKey) {
    resolvedSession =
      sessionsForGoal.find((session) => session.unitKey === move.unitKey) ?? null;
  }

  if (!resolvedSession && move.sourceDate) {
    const sessionsOnSourceDate =
      sessionsByGoalAndDate.get(`${resolvedGoalId}:${move.sourceDate}`) ?? [];
    if (sessionsOnSourceDate.length === 1) {
      resolvedSession = sessionsOnSourceDate[0] ?? null;
    } else if (sessionsOnSourceDate.length > 1) {
      return {
        patch: null,
        warning: `Ignored session move because ${resolvedGoalTitle} has multiple sessions on ${move.sourceDate}.`,
        unresolvedQuestion: `Which ${resolvedGoalTitle} session on ${move.sourceDate} should move to ${move.scheduledDate}?`,
      };
    }
  }

  if (!resolvedSession && sessionsForGoal.length === 1) {
    resolvedSession = sessionsForGoal[0] ?? null;
  }

  if (!resolvedSession) {
    return {
      patch: null,
      warning: `Ignored session move because no scheduled ${resolvedGoalTitle} session matched the provided reference.`,
      unresolvedQuestion: `Which existing ${resolvedGoalTitle} session should move to ${move.scheduledDate}?`,
    };
  }

  return {
    patch: {
      kind: "move_session",
      goalId: resolvedSession.goalId,
      unitKey: resolvedSession.unitKey,
      scheduledDate: move.scheduledDate,
    },
  };
}

function compileCalendarIntent(
  intent: z.infer<typeof calendarIntentSchema>,
  goalsById: Map<string, Goal>,
  sessionRoster: CoachSessionRosterEntry[]
) {
  const policyPatches: CoachPolicyPatch[] = [];
  const warnings: string[] = [];
  const unresolvedQuestions: string[] = [];

  const sessionByRef = new Map(
    sessionRoster.map((session) => [session.sessionRef, session] as const)
  );
  const sessionsByGoalId = new Map<string, CoachSessionRosterEntry[]>();
  const sessionsByGoalAndDate = new Map<string, CoachSessionRosterEntry[]>();
  for (const session of sessionRoster) {
    const byGoal = sessionsByGoalId.get(session.goalId) ?? [];
    byGoal.push(session);
    sessionsByGoalId.set(session.goalId, byGoal);
    const goalDateKey = `${session.goalId}:${session.scheduledDate}`;
    const byGoalAndDate = sessionsByGoalAndDate.get(goalDateKey) ?? [];
    byGoalAndDate.push(session);
    sessionsByGoalAndDate.set(goalDateKey, byGoalAndDate);
  }

  const appendUnresolvedQuestion = (question: string) => {
    if (!unresolvedQuestions.includes(question)) {
      unresolvedQuestions.push(question);
    }
  };

  if (intent.action === "none") {
    return { policyPatches, warnings, unresolvedQuestions };
  }
  if (intent.action === "needs_goal") {
    warnings.push(
      "No calendar edits were generated because this plan does not map to an existing goal."
    );
    return { policyPatches, warnings, unresolvedQuestions };
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
  if (intent.sessionMoves.length > 0) {
    const knownGoalIds = new Set(goalsById.keys());
    for (const move of intent.sessionMoves) {
      const resolution = resolveSessionMove({
        move,
        goalsById,
        knownGoalIds,
        sessionByRef,
        sessionsByGoalId,
        sessionsByGoalAndDate,
      });
      if (resolution.patch) {
        policyPatches.push(resolution.patch);
      }
      if (resolution.warning) {
        warnings.push(resolution.warning);
      }
      if (resolution.unresolvedQuestion) {
        appendUnresolvedQuestion(resolution.unresolvedQuestion);
      }
    }
  }
  if (policyPatches.length === 0) {
    warnings.push("The calendar intent did not contain any scheduling changes.");
  }
  return { policyPatches, warnings, unresolvedQuestions };
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
  sessionRoster = [],
}: {
  raw: unknown;
  goalsById: Map<string, Goal>;
  sessionRoster?: CoachSessionRosterEntry[];
}): SanitizedCoachTurn {
  const parsedEnvelope = coachTurnResponseSchema.safeParse(raw);
  if (!parsedEnvelope.success) {
    throw parsedEnvelope.error;
  }
  const envelope = parsedEnvelope.data;
  const compiled = compileCalendarIntent(
    envelope.proposal.calendarIntent,
    goalsById,
    sessionRoster
  );
  const unresolvedQuestions = [
    ...new Set([
      ...envelope.proposal.unresolvedQuestions,
      ...compiled.unresolvedQuestions,
    ]),
  ];

  return {
    schemaVersion: "1",
    phase: envelope.phase,
    reply: envelope.reply,
    proposal: {
      assessments: [],
      policyPatches: compiled.policyPatches,
      unresolvedQuestions,
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
            sessionMoves: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  sessionRef: { type: "string" },
                  goalId: { type: "string" },
                  goalRef: { type: "string" },
                  unitKey: { type: "string" },
                  sourceDate: { type: "string" },
                  scheduledDate: { type: "string" },
                },
                required: ["scheduledDate"],
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
