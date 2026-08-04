import {
  canonicalSerialize,
  compareCanonicalStrings,
} from "@/lib/planner/canonical";
import type {
  PlannerDriftFact,
  PlannerDriftType,
} from "@/lib/planner/reconciliation";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";

export type ActivePlanStatus = "active" | "superseded" | "dismissed";

export type PlannerStalenessReasonCode =
  | "goal_changed"
  | "goal_added"
  | "orphaned_goal"
  | "policy_changed"
  | "timezone_changed"
  | "eligibility_mode_changed"
  | "link_changed"
  | "inadmissible_fact"
  | "out_of_plan_fact"
  | "credited_work_removed"
  | "credited_work_reassigned"
  | "overdue_item"
  | "invalid_lock";

export interface PersistedPlanSemanticSnapshot {
  planId: string;
  status: ActivePlanStatus;
  eligibilityMode: "end_month_v1";
  timezone: string;
  policyFingerprint: string;
  goals: Record<string, PlannerGoalSemanticSnapshot>;
}

export interface PlannerGoalSemanticSnapshot {
  title: string;
  category: string;
  color: string | null;
  startDate: string;
  endDate: string | null;
  requirementFingerprint: string;
  assessmentInputHash: string;
  assessmentFingerprint: string;
}

export interface CurrentPlanSemanticState {
  eligibilityMode: "end_month_v1";
  timezone: string;
  policyFingerprint: string;
  goals: Record<string, PlannerGoalSemanticSnapshot>;
  linkedGoalIds: string[];
  workUnits: PlannerWorkUnit[];
  driftFacts: PlannerDriftFact[];
  invalidGoalIds: string[];
  localToday: string;
}

export interface PlannerStalenessReason {
  code: PlannerStalenessReasonCode;
  goalId: string | null;
  unitKey: string | null;
  completionId: string | null;
}

export interface PlannerStalenessResult {
  status: "fresh" | "stale" | "not_applicable";
  stale: boolean;
  reasons: PlannerStalenessReason[];
}

const driftReasonByType: Record<
  PlannerDriftType,
  PlannerStalenessReasonCode
> = {
  inadmissible: "inadmissible_fact",
  out_of_plan: "out_of_plan_fact",
  credited_work_removed: "credited_work_removed",
  credited_work_reassigned: "credited_work_reassigned",
};

function compareNullable(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return compareCanonicalStrings(left, right);
}

function reasonIdentity(reason: PlannerStalenessReason) {
  return [
    reason.code,
    reason.goalId ?? "",
    reason.unitKey ?? "",
    reason.completionId ?? "",
  ].join("\u0000");
}

function sortReasons(reasons: PlannerStalenessReason[]) {
  return Array.from(
    new Map(reasons.map((reason) => [reasonIdentity(reason), reason])).values()
  ).sort((left, right) => {
    const byCode = compareCanonicalStrings(left.code, right.code);
    if (byCode !== 0) return byCode;
    const byGoal = compareNullable(left.goalId, right.goalId);
    if (byGoal !== 0) return byGoal;
    const byUnit = compareNullable(left.unitKey, right.unitKey);
    return byUnit !== 0
      ? byUnit
      : compareNullable(left.completionId, right.completionId);
  });
}

function isOverdueIncomplete(
  unit: PlannerWorkUnit,
  localToday: string
) {
  if (unit.creditState !== "uncredited") {
    return false;
  }
  if (unit.scheduledDate !== null) {
    return unit.scheduledDate < localToday;
  }
  return (
    unit.placementWindow !== null &&
    unit.placementWindow.end < localToday
  );
}

/**
 * Compares current semantics with an immutable persisted plan snapshot.
 *
 * Accepted execution changes are already represented by current work units,
 * so moved dates and valid locks are deliberately not compared with original
 * assignments. Likewise, expected completed-as-scheduled progress is fresh.
 */
export function evaluateActivePlanStaleness({
  snapshot,
  current,
}: {
  snapshot: PersistedPlanSemanticSnapshot;
  current: CurrentPlanSemanticState;
}): PlannerStalenessResult {
  if (snapshot.status !== "active") {
    return {
      status: "not_applicable",
      stale: false,
      reasons: [],
    };
  }

  const reasons: PlannerStalenessReason[] = [];
  if (snapshot.timezone !== current.timezone) {
    reasons.push({
      code: "timezone_changed",
      goalId: null,
      unitKey: null,
      completionId: null,
    });
  }
  if (snapshot.eligibilityMode !== current.eligibilityMode) {
    reasons.push({
      code: "eligibility_mode_changed",
      goalId: null,
      unitKey: null,
      completionId: null,
    });
  }
  if (snapshot.policyFingerprint !== current.policyFingerprint) {
    reasons.push({
      code: "policy_changed",
      goalId: null,
      unitKey: null,
      completionId: null,
    });
  }

  const snapshotGoalIds = Object.keys(snapshot.goals).sort();
  const currentGoalIds = Object.keys(current.goals).sort();
  for (const goalId of snapshotGoalIds) {
    const currentGoal = current.goals[goalId];
    if (currentGoal === undefined) {
      reasons.push({
        code: "orphaned_goal",
        goalId,
        unitKey: null,
        completionId: null,
      });
    } else if (
      canonicalSerialize(currentGoal) !==
      canonicalSerialize(snapshot.goals[goalId])
    ) {
      reasons.push({
        code: "goal_changed",
        goalId,
        unitKey: null,
        completionId: null,
      });
    }
  }
  for (const goalId of currentGoalIds) {
    if (
      snapshot.goals[goalId] === undefined
    ) {
      reasons.push({
        code: "goal_added",
        goalId,
        unitKey: null,
        completionId: null,
      });
    }
  }

  const plannedGoalIds = new Set(snapshotGoalIds);
  for (const goalId of current.linkedGoalIds) {
    if (plannedGoalIds.has(goalId)) {
      reasons.push({
        code: "link_changed",
        goalId,
        unitKey: null,
        completionId: null,
      });
    }
  }
  for (const drift of current.driftFacts) {
    reasons.push({
      code: driftReasonByType[drift.driftType],
      goalId: null,
      unitKey: null,
      completionId: drift.completionId,
    });
  }
  for (const unit of current.workUnits) {
    if (isOverdueIncomplete(unit, current.localToday)) {
      reasons.push({
        code: "overdue_item",
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
        completionId: null,
      });
    }
  }
  for (const goalId of current.invalidGoalIds) {
    reasons.push({
      code: "invalid_lock",
      goalId,
      unitKey: null,
      completionId: null,
    });
  }

  const sortedReasons = sortReasons(reasons);
  return {
    status: sortedReasons.length === 0 ? "fresh" : "stale",
    stale: sortedReasons.length > 0,
    reasons: sortedReasons,
  };
}
