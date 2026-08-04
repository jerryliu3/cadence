export type PlannerMutationKind =
  | "scheduled_completion_added"
  | "scheduled_completion_removed"
  | "out_of_plan_completion_added"
  | "inadmissible_completion_added"
  | "item_moved"
  | "item_lock_changed"
  | "goal_requirement_changed"
  | "policy_changed"
  | "link_changed"
  | "plan_published"
  | "plan_dismissed"
  | "live_clock_became_overdue";

export interface PlannerFreshnessEffect {
  strictHashChanges: boolean;
  semanticBanner: "none" | "stale" | "not_applicable";
  canonicalRevisionChanges: boolean;
  executionRevisionChanges: boolean;
  reasonCode:
    | "expected_progress"
    | "accepted_execution_change"
    | "credited_work_removed"
    | "out_of_plan_fact"
    | "inadmissible_fact"
    | "goal_changed"
    | "policy_changed"
    | "link_changed"
    | "active_plan_changed"
    | "overdue_item";
}

export function evaluatePlannerMutationFreshness(
  mutation: PlannerMutationKind
): PlannerFreshnessEffect {
  const base = { strictHashChanges: true } as const;
  switch (mutation) {
    case "scheduled_completion_added":
      return {
        ...base,
        semanticBanner: "none",
        canonicalRevisionChanges: true,
        executionRevisionChanges: false,
        reasonCode: "expected_progress",
      };
    case "scheduled_completion_removed":
      return {
        ...base,
        semanticBanner: "stale",
        canonicalRevisionChanges: true,
        executionRevisionChanges: false,
        reasonCode: "credited_work_removed",
      };
    case "out_of_plan_completion_added":
      return {
        ...base,
        semanticBanner: "stale",
        canonicalRevisionChanges: true,
        executionRevisionChanges: false,
        reasonCode: "out_of_plan_fact",
      };
    case "inadmissible_completion_added":
      return {
        ...base,
        semanticBanner: "stale",
        canonicalRevisionChanges: true,
        executionRevisionChanges: false,
        reasonCode: "inadmissible_fact",
      };
    case "item_moved":
    case "item_lock_changed":
      return {
        ...base,
        semanticBanner: "none",
        canonicalRevisionChanges: false,
        executionRevisionChanges: true,
        reasonCode: "accepted_execution_change",
      };
    case "goal_requirement_changed":
      return {
        ...base,
        semanticBanner: "stale",
        canonicalRevisionChanges: true,
        executionRevisionChanges: false,
        reasonCode: "goal_changed",
      };
    case "policy_changed":
      return {
        ...base,
        semanticBanner: "stale",
        canonicalRevisionChanges: true,
        executionRevisionChanges: false,
        reasonCode: "policy_changed",
      };
    case "link_changed":
      return {
        ...base,
        semanticBanner: "stale",
        canonicalRevisionChanges: true,
        executionRevisionChanges: false,
        reasonCode: "link_changed",
      };
    case "plan_published":
      return {
        ...base,
        semanticBanner: "none",
        canonicalRevisionChanges: false,
        executionRevisionChanges: true,
        reasonCode: "active_plan_changed",
      };
    case "plan_dismissed":
      return {
        ...base,
        semanticBanner: "not_applicable",
        canonicalRevisionChanges: false,
        executionRevisionChanges: true,
        reasonCode: "active_plan_changed",
      };
    case "live_clock_became_overdue":
      return {
        ...base,
        semanticBanner: "stale",
        canonicalRevisionChanges: false,
        executionRevisionChanges: false,
        reasonCode: "overdue_item",
      };
  }
}
