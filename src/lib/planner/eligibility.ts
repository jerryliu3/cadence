import type { Goal } from "@/lib/goals/types";
import {
  isOrdinalGoalDefinition,
} from "@/lib/goals/definition-validation";
import { enumerateMonthsInWindow, type DateWindow } from "@/lib/planner/dates";
import {
  MAX_GOAL_TARGET_COUNT,
  MAX_HORIZON_MONTHS,
} from "@/lib/planner/contracts/bounds";
import type { EligibilityReason } from "@cadence/shared/planner/context";

export type { EligibilityReason } from "@cadence/shared/planner/context";

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
  if (goal.currentLinkRole === "source") {
    return { eligible: false, reason: "linked" };
  }
  if (goal.currentLinkRole === "target") {
    return { eligible: false, reason: "linked_target" };
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
  window: DateWindow,
  goal: EligibilityGoal
): EligibilityDecision {
  const staticDecision = evaluateStaticEligibility(goal);
  if (staticDecision) {
    return staticDecision;
  }

  if (goal.endDate !== null && goal.endDate < window.start) {
    return { eligible: false, reason: "end_outside_scope" };
  }
  if (goal.startDate > window.end) {
    return { eligible: false, reason: "starts_after_scope" };
  }
  return { eligible: true, reason: "eligible" };
}

export function evaluateGoalEligibility({
  window,
  ownerId,
  goal,
  currentLinkRole,
}: {
  window: DateWindow;
  ownerId: string;
  goal: Goal;
  currentLinkRole: EligibilityGoal["currentLinkRole"];
  asOfDate?: string;
}): EligibilityDecision {
  const isOrdinalGoal = isOrdinalGoalDefinition({
    frequencyType: goal.frequency_type,
    targetCount: goal.target_count,
  });
  const requiresDeadline = isOrdinalGoal;
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
  const decision = evaluateOverlapV1Eligibility(window, normalizedGoal);
  if (!decision.eligible) {
    return decision;
  }
  const targetCount = Number.isFinite(goal.target_count)
    ? Math.max(0, Math.floor(goal.target_count ?? 0))
    : 0;
  if (isOrdinalGoal && targetCount > MAX_GOAL_TARGET_COUNT) {
    return { eligible: false, reason: "target_exceeds_limit" };
  }
  if (goal.end_date === null) {
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
