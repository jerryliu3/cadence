export const PLANNER_CONTRACT_VERSION = "1" as const;
export const REQUIREMENT_SCHEMA_VERSION = "1" as const;
export const ASSESSMENT_SCHEMA_VERSION = "1" as const;
export const POLICY_SCHEMA_VERSION = "1" as const;
export const POLICY_COMPILER_VERSION = "1" as const;
export const SCHEDULER_VERSION = "ordered-dp-v2" as const;
export const PLANNER_ELIGIBILITY_MODES = ["overlap_v1"] as const;
export type PlannerEligibilityMode =
  (typeof PLANNER_ELIGIBILITY_MODES)[number];

export const MAX_ELIGIBLE_GOALS = 100;
export const MAX_WORK_UNITS = 5_000;
export const MAX_GOAL_TARGET_COUNT = 1_000;
export const MAX_COMPLETION_FACTS = 20_000;
export const MAX_POLICY_RANGES = 100;
export const MAX_HORIZON_MONTHS = 24;
/** Inclusive max length of a planner publish window. Publish windows are a contiguous span of whole months. Goal credit/horizon may still span MAX_HORIZON_MONTHS. */
export const MAX_PLANNER_WINDOW_DAYS = 366;
export const MAX_API_BODY_BYTES = 3 * 1024 * 1024;
