import { differenceInDateStrings } from "@/lib/goals/periods";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import type {
  SolverAssignment,
  SolverUnit,
} from "@/lib/planner/solver/types";
import { getSolverUnitId } from "@/lib/planner/solver/types";

export interface SoftRefinementResult {
  assignments: SolverAssignment[];
  evaluatedOperations: number;
  exhausted: boolean;
}

function unitCost(unit: SolverUnit, date: string) {
  return {
    moved: unit.previousDate === date ? 0 : 1,
    displacement:
      unit.previousDate && unit.previousDate !== date
        ? Math.abs(differenceInDateStrings(date, unit.previousDate))
        : 0,
    policy:
      (unit.idealDate
        ? Math.abs(differenceInDateStrings(date, unit.idealDate))
        : 0) + (unit.dateCosts?.[date] ?? 0),
  };
}

function costsEqual(
  unit: SolverUnit,
  leftDate: string,
  rightDate: string
) {
  const left = unitCost(unit, leftDate);
  const right = unitCost(unit, rightDate);
  return (
    left.moved === right.moved &&
    left.displacement === right.displacement &&
    left.policy === right.policy
  );
}

function buildDailyLoads(
  units: SolverUnit[],
  assignmentByKey: Map<string, string | null>,
  dates: string[]
) {
  const loads = new Map(dates.map((date) => [date, 0]));
  for (const unit of units) {
    const date = assignmentByKey.get(getSolverUnitId(unit));
    if (date) {
      loads.set(
        date,
        (loads.get(date) ?? 0) + (unit.estimatedMinutes ?? 30)
      );
    }
  }
  return loads;
}

function loadVarianceScore(loads: Map<string, number>, dates: string[]) {
  const values = dates.map((date) => loads.get(date) ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return (
    values.length *
      values.reduce((sum, value) => sum + value * value, 0) -
    total * total
  );
}

function assignmentIsOrdered(
  unit: SolverUnit,
  nextDate: string,
  goalUnits: SolverUnit[],
  assignmentByKey: Map<string, string | null>
) {
  const index = goalUnits.findIndex(
    (candidate) => getSolverUnitId(candidate) === getSolverUnitId(unit)
  );
  for (let before = index - 1; before >= 0; before -= 1) {
    const date = assignmentByKey.get(getSolverUnitId(goalUnits[before]));
    if (date) {
      if (date >= nextDate) {
        return false;
      }
      break;
    }
  }
  for (let after = index + 1; after < goalUnits.length; after += 1) {
    const date = assignmentByKey.get(getSolverUnitId(goalUnits[after]));
    if (date) {
      if (date <= nextDate) {
        return false;
      }
      break;
    }
  }
  return true;
}

function canAssignDate(
  unit: SolverUnit,
  nextDate: string,
  unitsByGoal: Map<string, SolverUnit[]>,
  assignmentByKey: Map<string, string | null>,
  ignoredUnitId?: string
) {
  if (
    unit.lockedDate !== null ||
    !unit.candidateDates.includes(nextDate)
  ) {
    return false;
  }
  const goalUnits = unitsByGoal.get(unit.goalId) ?? [];
  if (
    goalUnits.some(
      (candidate) =>
        candidate.unitKey !== unit.unitKey &&
        getSolverUnitId(candidate) !== ignoredUnitId &&
        assignmentByKey.get(getSolverUnitId(candidate)) === nextDate
    )
  ) {
    return false;
  }
  return assignmentIsOrdered(unit, nextDate, goalUnits, assignmentByKey);
}

export function refineDailyLoadVariance({
  dates: rawDates,
  units: rawUnits,
  assignments,
  operationBudget,
}: {
  dates: string[];
  units: SolverUnit[];
  assignments: SolverAssignment[];
  operationBudget: number;
}): SoftRefinementResult {
  const dates = Array.from(new Set(rawDates)).sort();
  const units = [...rawUnits].sort((left, right) => {
    const byGoal = compareCanonicalStrings(left.goalId, right.goalId);
    return byGoal !== 0
      ? byGoal
      : compareCanonicalStrings(left.unitKey, right.unitKey);
  });
  const unitsByGoal = new Map<string, SolverUnit[]>();
  for (const unit of units) {
    const existing = unitsByGoal.get(unit.goalId) ?? [];
    existing.push(unit);
    existing.sort((left, right) => left.ordinal - right.ordinal);
    unitsByGoal.set(unit.goalId, existing);
  }
  const assignmentByKey = new Map(
    assignments.map((assignment) => [
      getSolverUnitId(assignment),
      assignment.scheduledDate,
    ])
  );
  const loads = buildDailyLoads(units, assignmentByKey, dates);

  let evaluatedOperations = 0;
  let stoppedAtBudget = false;

  for (;;) {
    const currentScore = loadVarianceScore(loads, dates);
    let bestScore = currentScore;
    let bestApply: (() => void) | null = null;

    outerRelocate: for (const unit of units) {
      const currentDate = assignmentByKey.get(getSolverUnitId(unit));
      if (!currentDate) {
        continue;
      }
      for (const candidateDate of [...unit.candidateDates].sort()) {
        if (candidateDate === currentDate) {
          continue;
        }
        if (evaluatedOperations >= operationBudget) {
          stoppedAtBudget = true;
          break outerRelocate;
        }
        evaluatedOperations += 1;
        if (
          !costsEqual(unit, currentDate, candidateDate) ||
          !canAssignDate(
            unit,
            candidateDate,
            unitsByGoal,
            assignmentByKey
          )
        ) {
          continue;
        }
        const minutes = unit.estimatedMinutes ?? 30;
        const currentLoad = loads.get(currentDate) ?? 0;
        const candidateLoad = loads.get(candidateDate) ?? 0;
        const score =
          currentScore +
          dates.length *
            ((currentLoad - minutes) ** 2 +
              (candidateLoad + minutes) ** 2 -
              currentLoad ** 2 -
              candidateLoad ** 2);
        if (score < bestScore) {
          bestScore = score;
          bestApply = () => {
            assignmentByKey.set(getSolverUnitId(unit), candidateDate);
            loads.set(currentDate, currentLoad - minutes);
            loads.set(candidateDate, candidateLoad + minutes);
          };
        }
      }
    }

    if (!stoppedAtBudget) {
      outerSwap: for (let leftIndex = 0; leftIndex < units.length; leftIndex += 1) {
        const left = units[leftIndex];
        const leftDate = assignmentByKey.get(getSolverUnitId(left));
        if (!leftDate || left.lockedDate) {
          continue;
        }
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < units.length;
          rightIndex += 1
        ) {
          if (evaluatedOperations >= operationBudget) {
            stoppedAtBudget = true;
            break outerSwap;
          }
          evaluatedOperations += 1;
          const right = units[rightIndex];
          const rightDate = assignmentByKey.get(getSolverUnitId(right));
          if (
            !rightDate ||
            right.lockedDate ||
            left.goalId === right.goalId ||
            leftDate === rightDate ||
            !costsEqual(left, leftDate, rightDate) ||
            !costsEqual(right, rightDate, leftDate) ||
            !canAssignDate(
              left,
              rightDate,
              unitsByGoal,
              assignmentByKey,
              getSolverUnitId(right)
            ) ||
            !canAssignDate(
              right,
              leftDate,
              unitsByGoal,
              assignmentByKey,
              getSolverUnitId(left)
            )
          ) {
            continue;
          }
          const leftMinutes = left.estimatedMinutes ?? 30;
          const rightMinutes = right.estimatedMinutes ?? 30;
          const leftLoad = loads.get(leftDate) ?? 0;
          const rightLoad = loads.get(rightDate) ?? 0;
          const nextLeftLoad = leftLoad - leftMinutes + rightMinutes;
          const nextRightLoad = rightLoad - rightMinutes + leftMinutes;
          const score =
            currentScore +
            dates.length *
              (nextLeftLoad ** 2 +
                nextRightLoad ** 2 -
                leftLoad ** 2 -
                rightLoad ** 2);
          if (score < bestScore) {
            bestScore = score;
            bestApply = () => {
              assignmentByKey.set(getSolverUnitId(left), rightDate);
              assignmentByKey.set(getSolverUnitId(right), leftDate);
              loads.set(leftDate, nextLeftLoad);
              loads.set(rightDate, nextRightLoad);
            };
          }
        }
      }
    }

    if (!bestApply) {
      break;
    }
    bestApply();
    if (stoppedAtBudget) {
      break;
    }
  }

  return {
    assignments: assignments.map((assignment) => ({
      goalId: assignment.goalId,
      unitKey: assignment.unitKey,
      scheduledDate:
        assignmentByKey.get(getSolverUnitId(assignment)) ?? null,
    })),
    evaluatedOperations,
    exhausted: stoppedAtBudget,
  };
}
