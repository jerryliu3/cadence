export const PLANNER_CONTRACT_VERSION = "1" as const;
export const REQUIREMENT_SCHEMA_VERSION = "1" as const;
export const ASSESSMENT_SCHEMA_VERSION = "1" as const;
export const POLICY_SCHEMA_VERSION = "1" as const;
export const POLICY_COMPILER_VERSION = "1" as const;
export const SCHEDULER_VERSION = "ordered-dp-v1" as const;
export const PLANNER_ELIGIBILITY_MODES = ["overlap_v1"] as const;
export type PlannerEligibilityMode =
  (typeof PLANNER_ELIGIBILITY_MODES)[number];

export const MAX_ELIGIBLE_GOALS = 100;
export const MAX_WORK_UNITS = 5_000;
export const MAX_COMPLETION_FACTS = 20_000;
export const MAX_POLICY_RANGES = 100;
export const MAX_HORIZON_MONTHS = 24;
export const MAX_PLANNER_WINDOW_DAYS = 366;
export const MAX_API_BODY_BYTES = 3 * 1024 * 1024;
export const SOFT_REFINEMENT_MAX_OPERATIONS = 25_000;

export function getSoftRefinementOperationBudget(openUnitCount: number) {
  if (!Number.isSafeInteger(openUnitCount) || openUnitCount < 0) {
    throw new RangeError("openUnitCount must be a non-negative safe integer.");
  }

  return Math.min(
    SOFT_REFINEMENT_MAX_OPERATIONS,
    500 + 20 * openUnitCount
  );
}
