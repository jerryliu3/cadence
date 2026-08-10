import type { Completion, Goal } from "@/lib/goals/types";
import type { GoalAssessment } from "@/lib/planner/assessment";
import {
  canonicalHash,
  compareCanonicalStrings,
} from "@/lib/planner/canonical";
import {
  ASSESSMENT_SCHEMA_VERSION,
  POLICY_COMPILER_VERSION,
  POLICY_SCHEMA_VERSION,
  PLANNER_CONTRACT_VERSION,
  type PlannerEligibilityMode,
  REQUIREMENT_SCHEMA_VERSION,
  SCHEDULER_VERSION,
} from "@/lib/planner/contracts/bounds";
import {
  compilePlannerPolicy,
  type PlannerPolicy,
} from "@/lib/planner/policy";
import type { PlannerCompletionUnitIdentity } from "@/lib/planner/reconciliation";
import type { SolverSolveIntent } from "@/lib/planner/solver/types";
import type { PlannerBaseAssignment } from "@/lib/planner/work-units";

export interface PlannerCanonicalLink {
  sourceGoalId: string;
  targetGoalId: string;
}

export interface GenerationHashInput {
  eligibilityMode: PlannerEligibilityMode;
  solveIntent: SolverSolveIntent;
  preserveExistingAssignments: boolean;
  draftPinnedDates: Record<string, string>;
  scopeMonth: string;
  asOfDate: string;
  timezone: string;
  goals: Goal[];
  completions: Completion[];
  links: PlannerCanonicalLink[];
  assessments: GoalAssessment[];
  policy: PlannerPolicy;
  basePlan: {
    planId: string;
    version: number;
    assignments: PlannerBaseAssignment[];
    completionToUnit: Record<string, PlannerCompletionUnitIdentity>;
  } | null;
}

export function computeGenerationInputHash(input: GenerationHashInput) {
  return canonicalHash({
    versions: {
      plannerContract: PLANNER_CONTRACT_VERSION,
      eligibilityMode: input.eligibilityMode,
      solveIntent: input.solveIntent,
      scheduler: SCHEDULER_VERSION,
      requirementSchema: REQUIREMENT_SCHEMA_VERSION,
      assessmentSchema: ASSESSMENT_SCHEMA_VERSION,
      policySchema: POLICY_SCHEMA_VERSION,
      policyCompiler: POLICY_COMPILER_VERSION,
    },
    preserveExistingAssignments: input.preserveExistingAssignments,
    draftPinnedDates: Object.fromEntries(
      Object.entries(input.draftPinnedDates).sort(([left], [right]) =>
        compareCanonicalStrings(left, right)
      )
    ),
    scopeMonth: input.scopeMonth,
    asOfDate: input.asOfDate,
    timezone: input.timezone,
    goals: [...input.goals].sort((left, right) =>
      compareCanonicalStrings(left.id, right.id)
    ),
    completions: [...input.completions].sort((left, right) => {
      const byGoal = compareCanonicalStrings(left.goal_id, right.goal_id);
      if (byGoal !== 0) return byGoal;
      const byDate = compareCanonicalStrings(
        left.completed_on,
        right.completed_on
      );
      return byDate !== 0
        ? byDate
        : compareCanonicalStrings(left.id, right.id);
    }),
    links: [...input.links].sort((left, right) => {
      const bySource = compareCanonicalStrings(
        left.sourceGoalId,
        right.sourceGoalId
      );
      return bySource !== 0
        ? bySource
        : compareCanonicalStrings(left.targetGoalId, right.targetGoalId);
    }),
    assessments: [...input.assessments].sort((left, right) =>
      compareCanonicalStrings(left.goalId, right.goalId)
    ),
    policy: compilePlannerPolicy(input.policy).policy,
    basePlan: input.basePlan
      ? {
          ...input.basePlan,
          assignments: [...input.basePlan.assignments].sort((left, right) => {
            const byGoal = compareCanonicalStrings(
              left.goalId,
              right.goalId
            );
            if (byGoal !== 0) return byGoal;
            const byLineage = compareCanonicalStrings(
              left.requirementFingerprint,
              right.requirementFingerprint
            );
            return byLineage !== 0
              ? byLineage
              : compareCanonicalStrings(left.unitKey, right.unitKey);
          }),
        }
      : null,
  });
}
