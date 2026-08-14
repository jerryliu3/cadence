import { compareDateStrings } from "@/lib/goals/periods";
import type { Goal } from "@/lib/goals/types";
import { canonicalHash } from "@/lib/planner/canonical";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";

export type PlannerGoalUnplaceableReason = "capacity" | "invalid_lock";

export interface PlannerGoalUnplaceableRecord {
  goalId: string;
  requirementFingerprint: string;
  policyRevision: number;
  lockSignature: string;
  effectiveSpanEnd: string;
  unplacedCount: number;
  reason: PlannerGoalUnplaceableReason;
  computedAt?: string;
}

interface PlannerGoalLockSignatureInput {
  unitKey: string;
  scheduledDate: string;
  locked: boolean;
}

export function isPlannerGoalUnplaceableReason(
  value: string
): value is PlannerGoalUnplaceableReason {
  return value === "capacity" || value === "invalid_lock";
}

export function buildPlannerGoalLockSignature(
  entries: PlannerGoalLockSignatureInput[]
) {
  const signatureInput = entries
    .map((entry) => ({
      unitKey: entry.unitKey,
      scheduledDate: entry.scheduledDate,
      locked: entry.locked,
    }))
    .sort(
      (left, right) =>
        left.scheduledDate.localeCompare(right.scheduledDate) ||
        left.unitKey.localeCompare(right.unitKey)
    );
  return canonicalHash(signatureInput);
}

export function isPlannerGoalUnplaceableRecordValid({
  record,
  goal,
  policyRevision,
  lockSignature,
  preparationEnd,
}: {
  record: PlannerGoalUnplaceableRecord;
  goal: Goal;
  policyRevision: number;
  lockSignature: string;
  preparationEnd: string;
}) {
  const requirementFingerprint =
    normalizeGoalRequirement(goal).requirementFingerprint;
  const currentEffectiveEnd = [goal.end_date ?? preparationEnd, preparationEnd]
    .sort()[0]!;
  return (
    record.requirementFingerprint === requirementFingerprint &&
    record.policyRevision === policyRevision &&
    record.lockSignature === lockSignature &&
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
