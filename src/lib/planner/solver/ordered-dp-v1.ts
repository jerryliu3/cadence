import { differenceInDateStrings } from "@/lib/goals/periods";
import { compareCanonicalStrings } from "@/lib/planner/canonical";
import { getSoftRefinementOperationBudget } from "@/lib/planner/contracts/bounds";
import { refineDailyLoadVariance } from "@/lib/planner/solver/soft-refinement";
import type {
  PlannerSolverResult,
  SolverAssignment,
  SolverObjective,
  SolverSolveIntent,
  SolverUnit,
} from "@/lib/planner/solver/types";
import { getSolverUnitId } from "@/lib/planner/solver/types";

interface DpCell {
  objective: SolverObjective;
  choice: string | null;
  terminatesPrefix: boolean;
}

function addObjective(
  left: SolverObjective,
  right: SolverObjective
): SolverObjective {
  return {
    placed: left.placed + right.placed,
    moved: left.moved + right.moved,
    displacement: left.displacement + right.displacement,
    policyCost: left.policyCost + right.policyCost,
  };
}

function compareObjective(
  left: SolverObjective,
  right: SolverObjective,
  solveIntent: SolverSolveIntent
) {
  if (left.placed !== right.placed) {
    return left.placed > right.placed ? -1 : 1;
  }
  if (solveIntent === "replan") {
    if (left.policyCost !== right.policyCost) {
      return left.policyCost < right.policyCost ? -1 : 1;
    }
  }
  if (left.moved !== right.moved) {
    return left.moved < right.moved ? -1 : 1;
  }
  if (left.displacement !== right.displacement) {
    return left.displacement < right.displacement ? -1 : 1;
  }
  if (solveIntent === "stable" && left.policyCost !== right.policyCost) {
    return left.policyCost < right.policyCost ? -1 : 1;
  }
  return 0;
}

function scheduledObjective(unit: SolverUnit, date: string): SolverObjective {
  const moved = unit.previousDate === date ? 0 : 1;
  return {
    placed: 1,
    moved,
    displacement:
      moved && unit.previousDate
        ? Math.abs(differenceInDateStrings(date, unit.previousDate))
        : 0,
    policyCost: unit.dateCosts?.[date] ?? 0,
  };
}

function nullObjective(unit: SolverUnit): SolverObjective {
  return {
    placed: 0,
    moved: unit.previousDate === null ? 0 : 1,
    displacement: 0,
    policyCost: 0,
  };
}

function canonicalGoalUnits(units: SolverUnit[], dates: Set<string>) {
  return units
    .map((unit) => ({
      ...unit,
      candidateDates: Array.from(
        new Set(unit.candidateDates.filter((date) => dates.has(date)))
      ).sort(),
    }))
    .sort((left, right) => {
      if (left.ordinal !== right.ordinal) {
        return left.ordinal - right.ordinal;
      }
      return compareCanonicalStrings(left.unitKey, right.unitKey);
    });
}

function locksAreStructurallyValid(units: SolverUnit[]) {
  let previousLockedDate: string | null = null;
  const usedDates = new Set<string>();

  for (const unit of units) {
    if (!unit.lockedDate) {
      continue;
    }
    if (
      !unit.candidateDates.includes(unit.lockedDate) ||
      usedDates.has(unit.lockedDate) ||
      (previousLockedDate !== null && unit.lockedDate <= previousLockedDate)
    ) {
      return false;
    }
    previousLockedDate = unit.lockedDate;
    usedDates.add(unit.lockedDate);
  }
  return true;
}

function solveGoal(
  rawUnits: SolverUnit[],
  dates: string[],
  solveIntent: SolverSolveIntent
): SolverAssignment[] | null {
  const dateSet = new Set(dates);
  const units = canonicalGoalUnits(rawUnits, dateSet);
  if (!locksAreStructurallyValid(units)) {
    return null;
  }

  const dateIndices = new Map(dates.map((date, index) => [date, index]));
  const allNullSuffix: SolverObjective[] = Array.from(
    { length: units.length + 1 },
    () => ({ placed: 0, moved: 0, displacement: 0, policyCost: 0 })
  );
  for (let index = units.length - 1; index >= 0; index -= 1) {
    allNullSuffix[index] = addObjective(
      nullObjective(units[index]),
      allNullSuffix[index + 1]
    );
  }
  const scheduledObjectives = units.map(
    (unit) =>
      new Map(
        unit.candidateDates.map((date) => [
          date,
          scheduledObjective(unit, date),
        ])
      )
  );
  const suffixHasLock = Array.from(
    { length: units.length + 1 },
    () => false
  );
  for (let index = units.length - 1; index >= 0; index -= 1) {
    suffixHasLock[index] =
      units[index].lockedDate !== null || suffixHasLock[index + 1];
  }

  const terminalCell: DpCell = {
    objective: { placed: 0, moved: 0, displacement: 0, policyCost: 0 },
    choice: null,
    terminatesPrefix: false,
  };
  const cells: Array<Array<DpCell | null>> = Array.from(
    { length: units.length + 1 },
    () => Array.from({ length: dates.length + 1 }, () => null)
  );
  cells[units.length].fill(terminalCell);

  for (let unitIndex = units.length - 1; unitIndex >= 0; unitIndex -= 1) {
    const unit = units[unitIndex];
    const candidates = unit.lockedDate
      ? [unit.lockedDate]
      : unit.candidateDates;
    for (
      let minimumDateIndex = dates.length;
      minimumDateIndex >= 0;
      minimumDateIndex -= 1
    ) {
      let best: DpCell | null = null;
      for (const date of candidates) {
        const dateIndex = dateIndices.get(date);
        if (dateIndex === undefined || dateIndex < minimumDateIndex) {
          continue;
        }
        const child = cells[unitIndex + 1][dateIndex + 1];
        if (!child) {
          continue;
        }
        const candidate: DpCell = {
          objective: addObjective(
            scheduledObjectives[unitIndex].get(date)!,
            child.objective
          ),
          choice: date,
          terminatesPrefix: false,
        };
        if (
          !best ||
          compareObjective(candidate.objective, best.objective, solveIntent) < 0
        ) {
          best = candidate;
        }
      }

      if (!unit.lockedDate) {
        const prefixKind =
          unit.kind === "milestone_sequence" ||
          unit.kind === "deadline_total";
        const child = prefixKind
          ? null
          : cells[unitIndex + 1][minimumDateIndex];
        const candidate: DpCell | null =
          prefixKind && !suffixHasLock[unitIndex + 1]
          ? {
              objective: allNullSuffix[unitIndex],
              choice: null,
              terminatesPrefix: true,
            }
          : !prefixKind && child
            ? {
                objective: addObjective(
                  nullObjective(unit),
                  child.objective
                ),
                choice: null,
                terminatesPrefix: false,
              }
            : null;
        if (
          candidate &&
          (!best ||
            compareObjective(candidate.objective, best.objective, solveIntent) < 0)
        ) {
          best = candidate;
        }
      }
      cells[unitIndex][minimumDateIndex] = best;
    }
  }

  if (!cells[0][0]) {
    return null;
  }

  const assignments: SolverAssignment[] = [];
  let unitIndex = 0;
  let minimumDateIndex = 0;
  while (unitIndex < units.length) {
    const cell = cells[unitIndex][minimumDateIndex];
    if (!cell) {
      return null;
    }
    assignments.push({
      goalId: units[unitIndex].goalId,
      unitKey: units[unitIndex].unitKey,
      scheduledDate: cell.choice,
    });
    if (cell.choice !== null) {
      minimumDateIndex = (dateIndices.get(cell.choice) ?? -1) + 1;
    }
    unitIndex += 1;
    if (cell.terminatesPrefix) {
      while (unitIndex < units.length) {
        assignments.push({
          goalId: units[unitIndex].goalId,
          unitKey: units[unitIndex].unitKey,
          scheduledDate: null,
        });
        unitIndex += 1;
      }
    }
  }
  return assignments;
}

export function solveOrderedDpV1({
  dates: rawDates,
  units: rawUnits,
  solveIntent = "stable",
  simulateSoftBudgetExhaustion = false,
}: {
  dates: string[];
  units: SolverUnit[];
  solveIntent?: SolverSolveIntent;
  simulateSoftBudgetExhaustion?: boolean;
}): PlannerSolverResult {
  const dates = Array.from(new Set(rawDates)).sort();
  const dateSet = new Set(dates);
  const units = rawUnits
    .map((unit) => ({
      ...unit,
      candidateDates: Array.from(
        new Set(unit.candidateDates.filter((date) => dateSet.has(date)))
      ).sort(),
    }))
    .sort((left, right) => {
    const byGoal = compareCanonicalStrings(left.goalId, right.goalId);
    if (byGoal !== 0) return byGoal;
    if (left.ordinal !== right.ordinal) {
      return left.ordinal - right.ordinal;
    }
    return compareCanonicalStrings(left.unitKey, right.unitKey);
    });
  const unitKeys = new Set<string>();
  for (const unit of units) {
    const unitId = getSolverUnitId(unit);
    if (unitKeys.has(unitId)) {
      throw new Error(
        `Duplicate solver unit identity: ${unit.goalId}/${unit.unitKey}`
      );
    }
    unitKeys.add(unitId);
  }

  const byGoal = new Map<string, SolverUnit[]>();
  for (const unit of units) {
    const existing = byGoal.get(unit.goalId) ?? [];
    existing.push(unit);
    byGoal.set(unit.goalId, existing);
  }

  const assignmentsByKey = new Map<string, string | null>();
  const invalidGoalIds: string[] = [];
  for (const goalId of Array.from(byGoal.keys()).sort()) {
    const goalUnits = byGoal.get(goalId) ?? [];
    const goalAssignments = solveGoal(goalUnits, dates, solveIntent);
    if (!goalAssignments) {
      invalidGoalIds.push(goalId);
      for (const unit of goalUnits) {
        assignmentsByKey.set(getSolverUnitId(unit), null);
      }
      continue;
    }
    for (const assignment of goalAssignments) {
      assignmentsByKey.set(
        getSolverUnitId(assignment),
        assignment.scheduledDate
      );
    }
  }

  let assignments = units.map((unit) => ({
    goalId: unit.goalId,
    unitKey: unit.unitKey,
    scheduledDate: assignmentsByKey.get(getSolverUnitId(unit)) ?? null,
  }));
  if (invalidGoalIds.length > 0) {
    const invalidGoals = new Set(invalidGoalIds);
    const unaffectedShortfall = assignments.some(
      (assignment) =>
        !invalidGoals.has(assignment.goalId) &&
        assignment.scheduledDate === null
    );
    return {
      assignments,
      placementStatus: "partial",
      searchStatus: "blocked_invalid_lock",
      capacityStatus: "unverified",
      issueCodes: [
        "invalid_lock",
        ...(unaffectedShortfall
          ? (["placement_shortfall"] as const)
          : []),
      ],
      invalidGoalIds,
      publishable: false,
      confirmationRequired: false,
    };
  }

  const placedCount = assignments.filter(
    (assignment) => assignment.scheduledDate !== null
  ).length;
  const complete = placedCount === units.length;

  if (simulateSoftBudgetExhaustion) {
    return {
      assignments,
      placementStatus: complete ? "complete" : "partial",
      searchStatus: "soft_optimization_exhausted",
      capacityStatus: "unverified",
      issueCodes: [
        ...(complete ? [] : (["placement_shortfall"] as const)),
        "soft_optimization_exhausted",
      ],
      invalidGoalIds: [],
      publishable: true,
      confirmationRequired: !complete,
    };
  }

  const refinement = refineDailyLoadVariance({
    dates,
    units,
    assignments,
    operationBudget: getSoftRefinementOperationBudget(units.length),
  });
  assignments = refinement.assignments;
  if (refinement.exhausted) {
    return {
      assignments,
      placementStatus: complete ? "complete" : "partial",
      searchStatus: "soft_optimization_exhausted",
      capacityStatus: "unverified",
      issueCodes: [
        ...(complete ? [] : (["placement_shortfall"] as const)),
        "soft_optimization_exhausted",
      ],
      invalidGoalIds: [],
      publishable: true,
      confirmationRequired: !complete,
    };
  }

  return {
    assignments,
    placementStatus: complete ? "complete" : "partial",
    searchStatus: complete ? "all_units_placed" : "maximum_partial",
    capacityStatus: "unverified",
    issueCodes: complete ? [] : ["placement_shortfall"],
    invalidGoalIds: [],
    publishable: true,
    confirmationRequired: !complete,
  };
}
