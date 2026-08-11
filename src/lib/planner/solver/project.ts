import { enumerateDates } from "@/lib/planner/dates";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import type { GoalAssessment } from "@/lib/planner/assessment";
import {
  getCompiledDateCost,
  type CompiledPolicy,
} from "@/lib/planner/policy";
import type { SolverUnit } from "@/lib/planner/solver/types";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";

export function projectWorkUnitsToSolver({
  workUnits,
  compiledPolicy,
  assessments,
  completionDatesByGoal = new Map(),
  preserveExistingAssignments = false,
  draftPinnedDates = {},
}: {
  workUnits: PlannerWorkUnit[];
  compiledPolicy: CompiledPolicy;
  assessments: Map<string, GoalAssessment>;
  completionDatesByGoal?: Map<string, Set<string>>;
  preserveExistingAssignments?: boolean;
  draftPinnedDates?: Record<string, string>;
}): SolverUnit[] {
  const resolveLockedDate = (unit: PlannerWorkUnit) => {
    if (unit.locked) {
      return unit.scheduledDate;
    }
    const pinnedDate = draftPinnedDates[`${unit.originalGoalId}:${unit.unitKey}`];
    if (pinnedDate !== undefined) {
      return pinnedDate;
    }
    return preserveExistingAssignments ? unit.scheduledDate : null;
  };
  const isProjectable = (unit: PlannerWorkUnit) =>
    (unit.classification === "open" ||
      unit.classification === "future") &&
    unit.placementWindow !== null;
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
      // Preserve-mode locks the existing date even when the placement window
      // has moved forward (asOfDate). Keep that date in-domain so the solver
      // does not treat a still-valid preserved assignment as an invalid lock.
      if (
        preserveExistingAssignments &&
        unit.scheduledDate !== null &&
        !candidateDates.includes(unit.scheduledDate)
      ) {
        candidateDates.push(unit.scheduledDate);
        candidateDates.sort(compareCanonicalStrings);
      }
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
      solverUnits.push({
        unitKey: entry.source.unitKey,
        goalId,
        kind: entry.source.kind,
        ordinal: entry.source.ordinal,
        candidateDates: entry.candidateDates,
        previousDate: entry.source.scheduledDate,
        lockedDate: resolveLockedDate(entry.source),
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
