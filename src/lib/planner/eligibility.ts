import type { Goal } from "@/lib/goals/types";
import { isOrdinalGoalDefinition } from "@/lib/goals/definition-validation";
import { enumerateMonthsInWindow, getScopeDateRange } from "@/lib/planner/dates";
import { MAX_HORIZON_MONTHS } from "@/lib/planner/contracts/bounds";

export type EligibilityReason =
  | "eligible"
  | "not_owner"
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
  isDeleted: boolean;
  archivedAt: string | null;
  currentLinkRole: "none" | "source" | "target";
  outgoingShareCount: number;
  startDate: string;
  endDate: string | null;
  requiresDeadline?: boolean;
}

export interface EligibilityDecision {
  eligible: boolean;
  reason: EligibilityReason;
}

function evaluateStaticEligibility(goal: EligibilityGoal): EligibilityDecision | null {
  if (!goal.ownedByViewer) {
    return { eligible: false, reason: "not_owner" };
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
  if (goal.requiresDeadline !== false && goal.endDate === null) {
    return { eligible: false, reason: "missing_end_date" };
  }
  if (goal.endDate !== null && goal.startDate > goal.endDate) {
    return { eligible: false, reason: "invalid_date_range" };
  }
  return null;
}

export function evaluateOverlapV1Eligibility(
  scopeMonth: string,
  goal: EligibilityGoal
): EligibilityDecision {
  const staticDecision = evaluateStaticEligibility(goal);
  if (staticDecision) {
    return staticDecision;
  }

  const scope = getScopeDateRange(scopeMonth);
  if (goal.endDate !== null && goal.endDate < scope.start) {
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
}): EligibilityDecision {
  const requiresDeadline = isOrdinalGoalDefinition({
    frequencyType: goal.frequency_type,
    targetCount: goal.target_count,
  });
  const normalizedGoal: EligibilityGoal = {
    ownedByViewer: goal.owner_id === ownerId,
    isDeleted: goal.is_deleted,
    archivedAt: goal.archived_at,
    currentLinkRole,
    outgoingShareCount: 0,
    startDate: goal.start_date,
    endDate: goal.end_date,
    requiresDeadline,
  };
  const decision = evaluateOverlapV1Eligibility(scopeMonth, normalizedGoal);
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
