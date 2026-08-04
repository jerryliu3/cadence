export const PLANNER_CONTRACT_VERSION = "1" as const;
export const REQUIREMENT_SCHEMA_VERSION = "1" as const;
export const SCHEDULER_VERSION = "ordered-dp-v1" as const;
export const ELIGIBILITY_MODE = "end_month_v1" as const;

export const MAX_ELIGIBLE_GOALS = 100;
export const MAX_WORK_UNITS = 5_000;
export const MAX_COMPLETION_FACTS = 20_000;
export const MAX_POLICY_RANGES = 100;
export const MAX_CHAT_MESSAGES = 20;
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
