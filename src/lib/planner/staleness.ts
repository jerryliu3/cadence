import { compareCanonicalStrings } from "@/lib/planner/canonical";
import type {
  PlannerDriftFact,
  PlannerDriftType,
} from "@/lib/planner/reconciliation";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";

export type ActivePlanStatus = "active" | "superseded" | "dismissed";

export type PlannerStalenessReasonCode =
  | "credited_work_reassigned"
  | "credited_work_removed"
  | "inadmissible_fact"
  | "invalid_lock"
  | "out_of_plan_fact"
  | "overdue_item";

export interface PersistedPlanSemanticSnapshot {
  status: ActivePlanStatus;
}

export interface CurrentPlanSemanticState {
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

const driftReasonByType: Record<PlannerDriftType, PlannerStalenessReasonCode> = {
  credited_work_reassigned: "credited_work_reassigned",
  credited_work_removed: "credited_work_removed",
  inadmissible: "inadmissible_fact",
  out_of_plan: "out_of_plan_fact",
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
