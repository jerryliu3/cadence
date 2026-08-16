import {
  assertDateWindow,
  getScopeDateRange,
  monthFromDate,
  shiftMonth,
  type DateWindow,
} from "@/lib/planner/dates";

/**
 * Recovery re-places uncredited sessions whose saved date has already passed.
 *
 * The window is fixed rather than derived from where stranded sessions happen
 * to sit, because both ends are constrained: it has to reach back far enough to
 * pick sessions up, forward far enough for the solver to spread them, and stay
 * inside `MAX_PLANNER_WINDOW_DAYS` so the resulting moves can be saved in one
 * publish window.
 */
export const PLANNER_RECOVERY_LOOKBACK_MONTHS = 6;
export const PLANNER_RECOVERY_WINDOW_MONTHS = 12;

export function buildPlannerRecoveryWindow(asOfDate: string): DateWindow {
  const startMonth = shiftMonth(
    monthFromDate(asOfDate),
    -PLANNER_RECOVERY_LOOKBACK_MONTHS
  );
  const endMonth = shiftMonth(startMonth, PLANNER_RECOVERY_WINDOW_MONTHS - 1);
  return assertDateWindow({
    start: getScopeDateRange(startMonth).start,
    end: getScopeDateRange(endMonth).end,
  });
}

export interface PlannerRecoveryUnitSnapshot {
  originalGoalId: string;
  unitKey: string;
  scheduledDate: string | null;
  creditState: string;
}

export interface PlannerRecoveryMove {
  goalId: string;
  unitKey: string;
  sourceDate: string;
  scheduledDate: string;
}

export interface PlannerRecoveryPlan {
  moves: PlannerRecoveryMove[];
  /** Uncredited sessions sitting before `asOfDate` in the baseline solve. */
  strandedCount: number;
  /** Stranded sessions the solver could not pull forward. */
  unrecoverableCount: number;
}

function unitEntryKey(unit: { originalGoalId: string; unitKey: string }) {
  return `${unit.originalGoalId}:${unit.unitKey}`;
}

function isStranded(unit: PlannerRecoveryUnitSnapshot, asOfDate: string) {
  return (
    unit.creditState === "uncredited" &&
    unit.scheduledDate !== null &&
    unit.scheduledDate < asOfDate
  );
}

/**
 * Diffs a recovery solve against a plain solve over the same window and reports
 * only the sessions recovery actually pulled out of the past.
 *
 * A stranded session that the recovery solve leaves in place or leaves unplaced
 * is counted, not moved: its cadence period or goal deadline has lapsed, or the
 * remaining window had no room for it.
 */
export function buildPlannerRecoveryPlan({
  baselineUnits,
  recoveredUnits,
  asOfDate,
}: {
  baselineUnits: PlannerRecoveryUnitSnapshot[];
  recoveredUnits: PlannerRecoveryUnitSnapshot[];
  asOfDate: string;
}): PlannerRecoveryPlan {
  const strandedByEntryKey = new Map<string, string>();
  for (const unit of baselineUnits) {
    if (isStranded(unit, asOfDate)) {
      strandedByEntryKey.set(unitEntryKey(unit), unit.scheduledDate!);
    }
  }

  const moves: PlannerRecoveryMove[] = [];
  const recoveredEntryKeys = new Set<string>();
  for (const unit of recoveredUnits) {
    const entryKey = unitEntryKey(unit);
    const sourceDate = strandedByEntryKey.get(entryKey);
    if (sourceDate === undefined) {
      continue;
    }
    const nextDate = unit.scheduledDate;
    if (nextDate === null || nextDate < asOfDate || nextDate === sourceDate) {
      continue;
    }
    recoveredEntryKeys.add(entryKey);
    moves.push({
      goalId: unit.originalGoalId,
      unitKey: unit.unitKey,
      sourceDate,
      scheduledDate: nextDate,
    });
  }

  moves.sort(
    (left, right) =>
      left.scheduledDate.localeCompare(right.scheduledDate) ||
      left.goalId.localeCompare(right.goalId) ||
      left.unitKey.localeCompare(right.unitKey)
  );

  return {
    moves,
    strandedCount: strandedByEntryKey.size,
    unrecoverableCount: strandedByEntryKey.size - recoveredEntryKeys.size,
  };
}

export function describePlannerRecoveryOutcome(plan: PlannerRecoveryPlan) {
  if (plan.strandedCount === 0) {
    return "No past sessions need recovering.";
  }
  if (plan.moves.length === 0) {
    return `${plan.strandedCount} past ${
      plan.strandedCount === 1 ? "session" : "sessions"
    } can no longer be moved forward — their period or goal deadline has passed.`;
  }
  const moved = `Moved ${plan.moves.length} past ${
    plan.moves.length === 1 ? "session" : "sessions"
  } forward. Review and save to apply.`;
  return plan.unrecoverableCount === 0
    ? moved
    : `${moved} ${plan.unrecoverableCount} could not be moved — their period or goal deadline has passed.`;
}
