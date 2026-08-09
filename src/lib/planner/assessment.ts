import { z } from "zod";
import type { Goal } from "@/lib/goals/types";
import { canonicalHash } from "@/lib/planner/canonical";
import { ASSESSMENT_SCHEMA_VERSION } from "@/lib/planner/contracts/bounds";
import {
  normalizeGoalRequirement,
  type NormalizedGoalRequirement,
} from "@/lib/planner/requirements";

export const goalAssessmentSchema = z
  .object({
    schemaVersion: z.literal(ASSESSMENT_SCHEMA_VERSION),
    goalId: z.string().min(1).max(100),
    estimatedMinutesPerSession: z.number().int().min(5).max(480),
    // Legacy field kept optional for backward-compatible snapshot parsing.
    difficulty: z.number().int().min(1).max(5).optional(),
    priority: z.number().int().min(1).max(5),
    // Legacy fields kept optional for backward-compatible snapshot parsing.
    confidence: z.enum(["low", "medium", "high"]).optional(),
    rationale: z.string().max(1_000).optional(),
    assumptions: z.string().max(1_000),
    source: z.enum(["default", "ai", "user"]),
    assessmentInputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type GoalAssessment = z.infer<typeof goalAssessmentSchema>;

export function computeAssessmentInputHash(
  goal: Goal,
  normalizedRequirement: NormalizedGoalRequirement
) {
  return canonicalHash({
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    title: goal.title,
    description: goal.description,
    category: goal.category,
    startDate: goal.start_date,
    endDate: goal.end_date,
    requirement: normalizedRequirement,
  });
}

export function createDefaultAssessment(goal: Goal): GoalAssessment {
  const normalizedRequirement = normalizeGoalRequirement(goal);
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    goalId: goal.id,
    estimatedMinutesPerSession: 30,
    priority: 3,
    assumptions: "",
    source: "default",
    assessmentInputHash: computeAssessmentInputHash(
      goal,
      normalizedRequirement
    ),
  };
}
