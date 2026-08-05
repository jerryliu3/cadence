import { z } from "zod";
import type { Goal } from "@/lib/goals/types";
import {
  createDefaultAssessment,
  goalAssessmentSchema,
  type GoalAssessment,
} from "@/lib/planner/assessment";

export const MAX_COACH_MESSAGES = 20;
export const MAX_COACH_FOCUS_GOALS = 20;

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
            content: z.string().trim().min(1).max(4000),
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
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const coachTurnResponseSchema = z
  .object({
    schemaVersion: z.literal("1"),
    phase: z.enum(["discovery", "review", "ready", "explain"]),
    reply: z.string().trim().min(1).max(6000),
    proposal: z
      .object({
        assessments: z.array(z.unknown()).max(MAX_COACH_FOCUS_GOALS).optional(),
        policyPatches: z.array(z.unknown()).max(50).optional(),
        unresolvedQuestions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
      })
      .strict()
      .optional(),
    recommendations: z.array(coachRecommendationSchema).max(20).optional(),
  })
  .strict();

const weekdayArraySchema = z.array(z.number().int().min(0).max(6)).max(7);
const policyPatchSchema = z.discriminatedUnion("kind", [
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
      spacingStrategy: z.enum(["front_load", "even", "flexible"]),
    })
    .strict(),
]);

const assessmentPatchSchema = z
  .object({
    goalId: z.uuid(),
    estimatedMinutesPerSession: z.number().optional(),
    difficulty: z.number().optional(),
    priority: z.number().optional(),
    confidence: z.enum(["low", "medium", "high"]).optional(),
    rationale: z.string().max(1000).optional(),
    assumptions: z.string().max(1000).optional(),
  })
  .strict();

function clampInteger(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export type CoachPolicyPatch = z.infer<typeof policyPatchSchema>;
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
  const envelope = coachTurnResponseSchema.parse(raw);
  const warnings: string[] = [];

  const assessments = new Map<string, GoalAssessment>();
  for (const [index, rawAssessment] of (envelope.proposal?.assessments ?? []).entries()) {
    const parsed = assessmentPatchSchema.safeParse(rawAssessment);
    if (!parsed.success) {
      warnings.push(`Ignored malformed assessment proposal at index ${index}.`);
      continue;
    }
    const goal = goalsById.get(parsed.data.goalId);
    if (!goal) {
      warnings.push(`Ignored assessment for unknown goal ${parsed.data.goalId}.`);
      continue;
    }
    const baseline = createDefaultAssessment(goal);
    const candidate: GoalAssessment = {
      ...baseline,
      schemaVersion: "1",
      goalId: goal.id,
      estimatedMinutesPerSession: clampInteger(
        parsed.data.estimatedMinutesPerSession,
        5,
        480,
        baseline.estimatedMinutesPerSession
      ),
      difficulty: clampInteger(parsed.data.difficulty, 1, 5, baseline.difficulty),
      priority: clampInteger(parsed.data.priority, 1, 5, baseline.priority),
      confidence: parsed.data.confidence ?? baseline.confidence,
      rationale: (parsed.data.rationale ?? baseline.rationale).slice(0, 1000),
      assumptions: (parsed.data.assumptions ?? baseline.assumptions).slice(0, 1000),
      source: "ai",
      assessmentInputHash: baseline.assessmentInputHash,
    };
    assessments.set(goal.id, goalAssessmentSchema.parse(candidate));
  }

  const policyPatches: CoachPolicyPatch[] = [];
  for (const [index, rawPatch] of (envelope.proposal?.policyPatches ?? []).entries()) {
    const parsedPatch = policyPatchSchema.safeParse(rawPatch);
    if (!parsedPatch.success) {
      warnings.push(`Ignored unsupported policy patch at index ${index}.`);
      continue;
    }
    const patch = parsedPatch.data;
    if (
      "goalId" in patch &&
      patch.goalId !== null &&
      !goalsById.has(patch.goalId)
    ) {
      warnings.push(`Ignored policy patch for unknown goal ${patch.goalId}.`);
      continue;
    }
    policyPatches.push(patch);
  }

  return {
    schemaVersion: "1",
    phase: envelope.phase,
    reply: envelope.reply,
    proposal: {
      assessments: Array.from(assessments.values()),
      policyPatches,
      unresolvedQuestions: envelope.proposal?.unresolvedQuestions ?? [],
    },
    recommendations: envelope.recommendations ?? [],
    warnings,
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
        assessments: { type: "array", items: { type: "object" } },
        policyPatches: { type: "array", items: { type: "object" } },
        unresolvedQuestions: {
          type: "array",
          items: { type: "string" },
        },
      },
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
          extensions: { type: "object" },
        },
        required: ["text"],
      },
    },
  },
  required: ["schemaVersion", "phase", "reply"],
} as const;
