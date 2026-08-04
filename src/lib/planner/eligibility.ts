import type { Goal } from "@/lib/goals/types";
import { getScopeDateRange } from "@/lib/planner/dates";

export type EligibilityReason =
  | "eligible"
  | "not_owner"
  | "group_goal"
  | "deleted"
  | "archived"
  | "linked"
  | "missing_end_date"
  | "invalid_date_range"
  | "end_outside_scope"
  | "starts_after_scope";

export interface EligibilityGoal {
  ownedByViewer: boolean;
  isGroup: boolean;
  isDeleted: boolean;
  archivedAt: string | null;
  currentLinkRole: "none" | "source" | "target";
  outgoingShareCount: number;
  startDate: string;
  endDate: string | null;
}

export interface EligibilityDecision {
  eligible: boolean;
  reason: EligibilityReason;
}

export function evaluateEndMonthV1Eligibility(
  scopeMonth: string,
  goal: EligibilityGoal
): EligibilityDecision {
  if (!goal.ownedByViewer) {
    return { eligible: false, reason: "not_owner" };
  }
  if (goal.isGroup) {
    return { eligible: false, reason: "group_goal" };
  }
  if (goal.isDeleted) {
    return { eligible: false, reason: "deleted" };
  }
  if (goal.archivedAt !== null) {
    return { eligible: false, reason: "archived" };
  }
  if (goal.currentLinkRole !== "none") {
    return { eligible: false, reason: "linked" };
  }
  if (goal.endDate === null) {
    return { eligible: false, reason: "missing_end_date" };
  }
  if (goal.startDate > goal.endDate) {
    return { eligible: false, reason: "invalid_date_range" };
  }

  const scope = getScopeDateRange(scopeMonth);
  if (goal.endDate < scope.start || goal.endDate > scope.end) {
    return { eligible: false, reason: "end_outside_scope" };
  }
  if (goal.startDate > scope.end) {
    return { eligible: false, reason: "starts_after_scope" };
  }
  return { eligible: true, reason: "eligible" };
}

export function evaluateGoalEligibility({
  scopeMonth,
  ownerId,
  goal,
  currentLinkRole,
}: {
  scopeMonth: string;
  ownerId: string;
  goal: Goal;
  currentLinkRole: EligibilityGoal["currentLinkRole"];
}) {
  return evaluateEndMonthV1Eligibility(scopeMonth, {
    ownedByViewer: goal.owner_id === ownerId,
    isGroup: goal.is_group,
    isDeleted: goal.is_deleted,
    archivedAt: goal.archived_at,
    currentLinkRole,
    outgoingShareCount: 0,
    startDate: goal.start_date,
    endDate: goal.end_date,
  });
}
