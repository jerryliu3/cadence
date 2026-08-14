import { compareDateStrings } from "@/lib/goals/periods";
import type { Goal } from "@/lib/goals/types";
import {
  MAX_HORIZON_MONTHS,
} from "@/lib/planner/contracts/bounds";
import { getScopeDateRange, nextMonth } from "@/lib/planner/dates";
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

function addMonths(month: string, count: number) {
  let result = month;
  for (let index = 0; index < count; index += 1) {
    result = nextMonth(result);
  }
  return result;
}

export function resolvePreparationHorizonWindow(asOfDate: string) {
  const firstMonth = asOfDate.slice(0, 7);
  const start = getScopeDateRange(firstMonth).start;
  const lastMonth = addMonths(firstMonth, MAX_HORIZON_MONTHS - 1);
  const end = getScopeDateRange(lastMonth).end;
  return { start, end };
}

export function buildPreparationWindows(asOfDate: string) {
  const firstMonth = asOfDate.slice(0, 7);
  const windows: Array<{ start: string; end: string }> = [];
  // Chunk by 12 months so each window remains within MAX_PLANNER_WINDOW_DAYS
  // (366 in leap years), matching the bounded write contract.
  for (let offset = 0; offset < MAX_HORIZON_MONTHS; offset += 12) {
    const startMonth = addMonths(firstMonth, offset);
    const monthCount = Math.min(12, MAX_HORIZON_MONTHS - offset);
    const endMonth = addMonths(startMonth, monthCount - 1);
    windows.push({
      start: getScopeDateRange(startMonth).start,
      end: getScopeDateRange(endMonth).end,
    });
  }
  return windows;
}

export function buildGoalPreparationWindows({
  goal,
  asOfDate,
  preparationStart,
  preparationEnd,
}: {
  goal: Goal;
  asOfDate: string;
  preparationStart: string;
  preparationEnd: string;
}) {
  const effectiveStart = [goal.start_date, asOfDate, preparationStart]
    .sort()
    .at(-1)!;
  const effectiveEnd = [goal.end_date ?? preparationEnd, preparationEnd].sort()[0]!;
  if (effectiveEnd < effectiveStart) {
    return {
      effectiveStart,
      effectiveEnd,
      windows: [] as Array<{ start: string; end: string }>,
    };
  }

  const firstMonth = effectiveStart.slice(0, 7);
  const lastMonth = effectiveEnd.slice(0, 7);
  const windows: Array<{ start: string; end: string }> = [];
  let currentMonth = firstMonth;
  while (currentMonth <= lastMonth) {
    const maxEndMonth = addMonths(currentMonth, 11);
    const endMonth = maxEndMonth < lastMonth ? maxEndMonth : lastMonth;
    windows.push({
      start: getScopeDateRange(currentMonth).start,
      end: getScopeDateRange(endMonth).end,
    });
    currentMonth = addMonths(endMonth, 1);
  }
  return { effectiveStart, effectiveEnd, windows };
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
