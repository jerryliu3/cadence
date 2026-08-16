import { enumerateDates } from "@/lib/planner/dates";
import { compareDateStrings } from "@/lib/goals/periods";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import type { GoalAssessment } from "@/lib/planner/assessment";
import {
  getCompiledDateCost,
  type CompiledPolicy,
} from "@/lib/planner/policy";
import {
  computeCadenceIdealDate,
  computeLifetimeIdealDate,
} from "@/lib/planner/solver/ideal-dates";
import type { SolverUnit } from "@/lib/planner/solver/types";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";
import type { DateWindow } from "@/lib/planner/dates";

export function projectWorkUnitsToSolver({
  workUnits,
  compiledPolicy,
  assessments,
  completionDatesByGoal = new Map(),
  preserveExistingAssignments = false,
  recoverPastPlacements = false,
  draftPinnedDates = {},
  idealDateContextByGoal = new Map(),
}: {
  workUnits: PlannerWorkUnit[];
  compiledPolicy: CompiledPolicy;
  assessments: Map<string, GoalAssessment>;
  completionDatesByGoal?: Map<string, Set<string>>;
  preserveExistingAssignments?: boolean;
  recoverPastPlacements?: boolean;
  draftPinnedDates?: Record<string, string>;
  idealDateContextByGoal?: Map<
    string,
    { targetCount: number; remainingLifetime: DateWindow }
  >;
}): SolverUnit[] {
  const hasDraftPin = (unit: PlannerWorkUnit) =>
    draftPinnedDates[`${unit.originalGoalId}:${unit.unitKey}`] !== undefined;
  const sitsBeforePlacementWindow = (unit: PlannerWorkUnit) =>
    unit.scheduledDate !== null &&
    unit.placementWindow !== null &&
    compareDateStrings(unit.scheduledDate, unit.placementWindow.start) < 0;
  /**
   * Recovery releases a stale placement so the solver can re-place it. Only an
   * uncredited, unlocked, unpinned unit that still has a placement window
   * qualifies: a lapsed cadence period or a passed goal deadline leaves no
   * window, so those stay where they are and remain missed.
   */
  const isRecoverablePastPlacement = (unit: PlannerWorkUnit) =>
    recoverPastPlacements &&
    !unit.locked &&
    !hasDraftPin(unit) &&
    unit.creditState === "uncredited" &&
    sitsBeforePlacementWindow(unit);
  const resolveLockedDate = (unit: PlannerWorkUnit) => {
    if (unit.locked) {
      return unit.scheduledDate;
    }
    const pinnedDate = draftPinnedDates[`${unit.originalGoalId}:${unit.unitKey}`];
    if (pinnedDate !== undefined) {
      return pinnedDate;
    }
    if (isRecoverablePastPlacement(unit)) {
      return null;
    }
    return preserveExistingAssignments ? unit.scheduledDate : null;
  };
  // Preserve-mode placements before the active window (asOfDate moved forward)
  // are already fixed. Leave them out of the solver instead of soft-locking a
  // date the placement window no longer admits.
  const isFixedPreservedPastPlacement = (unit: PlannerWorkUnit) => {
    if (!preserveExistingAssignments || unit.locked) {
      return false;
    }
    if (hasDraftPin(unit) || isRecoverablePastPlacement(unit)) {
      return false;
    }
    return sitsBeforePlacementWindow(unit);
  };
  const isProjectable = (unit: PlannerWorkUnit) =>
    (unit.classification === "open" ||
      unit.classification === "future") &&
    unit.placementWindow !== null &&
    !isFixedPreservedPastPlacement(unit);
  const reservedDatesByGoal = new Map<string, Set<string>>();
  for (const unit of workUnits) {
    if (isProjectable(unit) || unit.scheduledDate === null) {
      continue;
    }
    const reserved =
      reservedDatesByGoal.get(unit.originalGoalId) ?? new Set<string>();
    reserved.add(unit.scheduledDate);
    reservedDatesByGoal.set(unit.originalGoalId, reserved);
  }
  for (const [goalId, dates] of completionDatesByGoal) {
    const reserved = reservedDatesByGoal.get(goalId) ?? new Set<string>();
    for (const date of dates) {
      reserved.add(date);
    }
    reservedDatesByGoal.set(goalId, reserved);
  }
  const projected = workUnits
    .filter(isProjectable)
    .map((unit) => {
      if (unit.locked && unit.scheduledDate === null) {
        throw new Error(`Locked unit ${unit.unitKey} has no scheduled date.`);
      }
      const candidateDates = enumerateDates(unit.placementWindow!).filter(
        (date) => !reservedDatesByGoal.get(unit.originalGoalId)?.has(date)
      );
      return {
        source: unit,
        candidateDates,
      };
    });

  const byGoal = new Map<string, typeof projected>();
  for (const entry of projected) {
    const existing = byGoal.get(entry.source.originalGoalId) ?? [];
    existing.push(entry);
    byGoal.set(entry.source.originalGoalId, existing);
  }

  const solverUnits: SolverUnit[] = [];
  for (const goalId of Array.from(byGoal.keys()).sort()) {
    const entries = (byGoal.get(goalId) ?? []).sort((left, right) => {
      if (left.source.ordinal !== right.source.ordinal) {
        return left.source.ordinal - right.source.ordinal;
      }
      return compareCanonicalStrings(
        left.source.unitKey,
        right.source.unitKey
      );
    });
    entries.forEach((entry) => {
      const idealDate =
        entry.source.kind === "cadence"
          ? computeCadenceIdealDate({
              goalId,
              periodKey: entry.source.periodKey!,
              candidateDates: entry.candidateDates,
            })
          : (() => {
              const context = idealDateContextByGoal.get(goalId);
              return context
                ? computeLifetimeIdealDate({
                    goalId,
                    ordinal: entry.source.ordinal,
                    targetCount: context.targetCount,
                    remainingLifetime: context.remainingLifetime,
                    candidateDates: entry.candidateDates,
                  })
                : null;
            })();
      solverUnits.push({
        unitKey: entry.source.unitKey,
        goalId,
        kind: entry.source.kind,
        ordinal: entry.source.ordinal,
        candidateDates: entry.candidateDates,
        previousDate: entry.source.scheduledDate,
        lockedDate: resolveLockedDate(entry.source),
        idealDate,
        dateCosts: Object.fromEntries(
          entry.candidateDates.map((date) => [
            date,
            getCompiledDateCost(
              compiledPolicy,
              date,
              entry.source.restEligible
            ),
          ])
        ),
        estimatedMinutes:
          assessments.get(goalId)?.estimatedMinutesPerSession ?? 30,
      });
    });
  }

  return solverUnits;
}
