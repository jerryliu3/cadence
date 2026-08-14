import { compareDateStrings } from "@/lib/goals/periods";
import type { Goal } from "@/lib/goals/types";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";

export type PlannerGoalUnplaceableReason = "capacity" | "invalid_lock";

export interface PlannerGoalUnplaceableRecord {
  goalId: string;
  requirementFingerprint: string;
  policyRevision: number;
  effectiveSpanEnd: string;
  unplacedCount: number;
  reason: PlannerGoalUnplaceableReason;
  computedAt?: string;
}

export interface PlannerGoalUnplaceableSummary {
  goalId: string;
  title: string;
  unplacedCount: number;
  reason: PlannerGoalUnplaceableReason;
}

export function isPlannerGoalUnplaceableReason(
  value: string
): value is PlannerGoalUnplaceableReason {
  return value === "capacity" || value === "invalid_lock";
}

export function isPlannerGoalUnplaceableRecordValid({
  record,
  goal,
  policyRevision,
  preparationEnd,
}: {
  record: PlannerGoalUnplaceableRecord;
  goal: Goal;
  policyRevision: number;
  preparationEnd: string;
}) {
  const requirementFingerprint =
    normalizeGoalRequirement(goal).requirementFingerprint;
  const currentEffectiveEnd = [goal.end_date ?? preparationEnd, preparationEnd]
    .sort()[0]!;
  return (
    record.requirementFingerprint === requirementFingerprint &&
    record.policyRevision === policyRevision &&
    compareDateStrings(record.effectiveSpanEnd, currentEffectiveEnd) >= 0
  );
}

export function summarizePlannerGoalUnplaceableRecords({
  records,
  goalTitles,
}: {
  records: PlannerGoalUnplaceableRecord[];
  goalTitles: Record<string, string>;
}) {
  return records
    .filter((record) => record.unplacedCount > 0)
    .map((record) => ({
      goalId: record.goalId,
      title: goalTitles[record.goalId] ?? record.goalId,
      unplacedCount: record.unplacedCount,
      reason: record.reason,
    }))
    .sort(
      (left, right) =>
        right.unplacedCount - left.unplacedCount ||
        left.title.localeCompare(right.title)
    );
}
