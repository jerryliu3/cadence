import type { Goal } from "@/lib/goals/types";
import { enumerateMonthsInWindow, getScopeDateRange } from "@/lib/planner/dates";
import {
  MAX_HORIZON_MONTHS,
  type PlannerEligibilityMode,
} from "@/lib/planner/contracts/bounds";

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
  | "starts_after_scope"
  | "horizon_too_long";

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

function evaluateStaticEligibility(goal: EligibilityGoal): EligibilityDecision | null {
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
  if (goal.endDate !== null && goal.startDate > goal.endDate) {
    return { eligible: false, reason: "invalid_date_range" };
  }
  return null;
}

export function evaluateEndMonthV1Eligibility(
  scopeMonth: string,
  goal: EligibilityGoal
): EligibilityDecision {
  const staticDecision = evaluateStaticEligibility(goal);
  if (staticDecision) {
    return staticDecision;
  }
  if (goal.endDate === null) {
    return { eligible: false, reason: "missing_end_date" };
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

export function evaluateOverlapV1Eligibility(
  scopeMonth: string,
  goal: EligibilityGoal
): EligibilityDecision {
  const staticDecision = evaluateStaticEligibility(goal);
  if (staticDecision) {
    return staticDecision;
  }
  if (goal.endDate === null) {
    return { eligible: false, reason: "missing_end_date" };
  }

  const scope = getScopeDateRange(scopeMonth);
  if (goal.endDate < scope.start) {
    return { eligible: false, reason: "end_outside_scope" };
  }
  if (goal.startDate > scope.end) {
    return { eligible: false, reason: "starts_after_scope" };
  }
  return { eligible: true, reason: "eligible" };
}

export function evaluateGoalEligibility({
  eligibilityMode,
  scopeMonth,
  ownerId,
  goal,
  currentLinkRole,
}: {
  eligibilityMode: PlannerEligibilityMode;
  scopeMonth: string;
  ownerId: string;
  goal: Goal;
  currentLinkRole: EligibilityGoal["currentLinkRole"];
}): EligibilityDecision {
  const isOrdinalGoal =
    goal.frequency_type === "fixed_milestones" ||
    (goal.frequency_type === "recurring" &&
      typeof goal.target_count === "number" &&
      goal.target_count > 0);
  const normalizedGoal: EligibilityGoal = {
    ownedByViewer: goal.owner_id === ownerId,
    isGroup: goal.is_group,
    isDeleted: goal.is_deleted,
    archivedAt: goal.archived_at,
    currentLinkRole,
    outgoingShareCount: 0,
    startDate: goal.start_date,
    endDate: goal.end_date,
  };
  let decision: EligibilityDecision;
  if (goal.end_date === null) {
    if (isOrdinalGoal) {
      decision = { eligible: false, reason: "missing_end_date" };
    } else {
      const scope = getScopeDateRange(scopeMonth);
      decision =
        goal.start_date > scope.end
          ? { eligible: false, reason: "starts_after_scope" }
          : { eligible: true, reason: "eligible" };
    }
  } else {
    decision =
      eligibilityMode === "overlap_v1"
        ? evaluateOverlapV1Eligibility(scopeMonth, normalizedGoal)
        : evaluateEndMonthV1Eligibility(scopeMonth, normalizedGoal);
  }
  if (!decision.eligible || goal.end_date === null) {
    return decision;
  }
  const horizonMonths = enumerateMonthsInWindow({
    start: goal.start_date,
    end: goal.end_date,
  });
  if (horizonMonths.length > MAX_HORIZON_MONTHS) {
    return { eligible: false, reason: "horizon_too_long" };
  }
  return decision;
}
