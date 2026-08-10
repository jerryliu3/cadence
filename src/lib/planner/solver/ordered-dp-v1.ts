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

type SecondaryObjectiveTuple = [number, number, number];

function getSecondaryObjectiveTuple(
  objective: SolverObjective,
  solveIntent: SolverSolveIntent
): SecondaryObjectiveTuple {
  if (solveIntent === "replan") {
    return [objective.policyCost, objective.moved, objective.displacement];
  }
  return [objective.moved, objective.displacement, objective.policyCost];
}

function subtractSecondaryObjectiveTuple(
  left: SecondaryObjectiveTuple,
  right: SecondaryObjectiveTuple
): SecondaryObjectiveTuple {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function buildLexicographicWeights({
  maxAbsByComponent,
  maxSelections,
}: {
  maxAbsByComponent: SecondaryObjectiveTuple;
  maxSelections: number;
}): SecondaryObjectiveTuple {
  const selectionBound = Math.max(maxSelections, 1);
  const totalAbs: SecondaryObjectiveTuple = [
    maxAbsByComponent[0] * selectionBound,
    maxAbsByComponent[1] * selectionBound,
    maxAbsByComponent[2] * selectionBound,
  ];
  const weights: SecondaryObjectiveTuple = [0, 0, 1];
  for (let index = 1; index >= 0; index -= 1) {
    let lowerSwing = 0;
    for (let lower = index + 1; lower < 3; lower += 1) {
      lowerSwing += 2 * totalAbs[lower] * weights[lower];
    }
    weights[index] = lowerSwing + 1;
  }
  return weights;
}

function encodeSecondaryTuple(
  tuple: SecondaryObjectiveTuple,
  weights: SecondaryObjectiveTuple
) {
  return (
    tuple[0] * weights[0] +
    tuple[1] * weights[1] +
    tuple[2] * weights[2]
  );
}

function solveMinimumCostAssignment(costByRowColumn: number[][]) {
  const rowCount = costByRowColumn.length;
  if (rowCount === 0) {
    return [] as number[];
  }
  const columnCount = costByRowColumn[0]?.length ?? 0;
  if (columnCount < rowCount) {
    return null;
  }
  for (const row of costByRowColumn) {
    if (row.length !== columnCount) {
      throw new Error("Assignment matrix rows must have equal width.");
    }
  }

  const u = Array.from({ length: rowCount + 1 }, () => 0);
  const v = Array.from({ length: columnCount + 1 }, () => 0);
  const p = Array.from({ length: columnCount + 1 }, () => 0);
  const way = Array.from({ length: columnCount + 1 }, () => 0);

  for (let row = 1; row <= rowCount; row += 1) {
    p[0] = row;
    let column0 = 0;
    const minReducedCost = Array.from(
      { length: columnCount + 1 },
      () => Number.POSITIVE_INFINITY
    );
    const usedColumns = Array.from({ length: columnCount + 1 }, () => false);

    do {
      usedColumns[column0] = true;
      const row0 = p[column0];
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;

      for (let column = 1; column <= columnCount; column += 1) {
        if (usedColumns[column]) {
          continue;
        }
        const reducedCost =
          costByRowColumn[row0 - 1][column - 1] - u[row0] - v[column];
        if (reducedCost < minReducedCost[column]) {
          minReducedCost[column] = reducedCost;
          way[column] = column0;
        }
        if (minReducedCost[column] < delta) {
          delta = minReducedCost[column];
          column1 = column;
        }
      }

      if (!Number.isFinite(delta)) {
        return null;
      }

      for (let column = 0; column <= columnCount; column += 1) {
        if (usedColumns[column]) {
          u[p[column]] += delta;
          v[column] -= delta;
        } else {
          minReducedCost[column] -= delta;
        }
      }
      column0 = column1;
    } while (p[column0] !== 0);

    do {
      const column1 = way[column0];
      p[column0] = p[column1];
      column0 = column1;
    } while (column0 !== 0);
  }

  const selectedColumnByRow = Array.from({ length: rowCount }, () => -1);
  for (let column = 1; column <= columnCount; column += 1) {
    const row = p[column];
    if (row > 0) {
      selectedColumnByRow[row - 1] = column - 1;
    }
  }
  if (selectedColumnByRow.some((column) => column < 0)) {
    return null;
  }
  return selectedColumnByRow;
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
  const usedDates = new Set<string>();

  for (const unit of units) {
    if (!unit.lockedDate) {
      continue;
    }
    if (
      !unit.candidateDates.includes(unit.lockedDate) ||
      usedDates.has(unit.lockedDate)
    ) {
      return false;
    }
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
  const assignedByUnitId = new Map<string, string | null>();
  const lockedDates = new Set<string>();
  const unlockedUnits: SolverUnit[] = [];
  for (const unit of units) {
    if (unit.lockedDate !== null) {
      assignedByUnitId.set(getSolverUnitId(unit), unit.lockedDate);
      lockedDates.add(unit.lockedDate);
      continue;
    }
    unlockedUnits.push(unit);
  }
  const availableDates = dates.filter((date) => !lockedDates.has(date));
  if (availableDates.length === 0 || unlockedUnits.length === 0) {
    for (const unit of unlockedUnits) {
      assignedByUnitId.set(getSolverUnitId(unit), null);
    }
    return units.map((unit) => ({
      goalId: unit.goalId,
      unitKey: unit.unitKey,
      scheduledDate: assignedByUnitId.get(getSolverUnitId(unit)) ?? null,
    }));
  }

  const dateIndexByValue = new Map(
    availableDates.map((date, index) => [date, index])
  );
  const candidateDateIndicesByUnit = unlockedUnits.map((unit) =>
    unit.candidateDates
      .filter((date) => !lockedDates.has(date))
      .map((date) => dateIndexByValue.get(date))
      .filter((index): index is number => index !== undefined)
  );
  const rowCount = availableDates.length;
  const columnCount = unlockedUnits.length + rowCount;
  const secondaryDeltaByDateAndUnit: Array<
    Array<SecondaryObjectiveTuple | null>
  > =
    Array.from({ length: rowCount }, () =>
      Array.from({ length: unlockedUnits.length }, () => null)
    );
  const maxAbsByComponent: SecondaryObjectiveTuple = [0, 0, 0];

  for (let unitIndex = 0; unitIndex < unlockedUnits.length; unitIndex += 1) {
    const unit = unlockedUnits[unitIndex];
    const nullSecondary = getSecondaryObjectiveTuple(
      nullObjective(unit),
      solveIntent
    );
    for (const dateIndex of candidateDateIndicesByUnit[unitIndex]) {
      const date = availableDates[dateIndex];
      const scheduledSecondary = getSecondaryObjectiveTuple(
        scheduledObjective(unit, date),
        solveIntent
      );
      const secondaryDelta = subtractSecondaryObjectiveTuple(
        scheduledSecondary,
        nullSecondary
      );
      secondaryDeltaByDateAndUnit[dateIndex][unitIndex] = secondaryDelta;
      for (let component = 0; component < 3; component += 1) {
        const absolute = Math.abs(secondaryDelta[component]);
        if (absolute > maxAbsByComponent[component]) {
          maxAbsByComponent[component] = absolute;
        }
      }
    }
  }

  const weights = buildLexicographicWeights({
    maxAbsByComponent,
    maxSelections: rowCount,
  });
  let maxAbsEncodedDelta = 0;
  const encodedDeltaByDateAndUnit: Array<Array<number | null>> =
    Array.from({ length: rowCount }, () =>
      Array.from({ length: unlockedUnits.length }, () => null)
    );
  for (let dateIndex = 0; dateIndex < rowCount; dateIndex += 1) {
    for (let unitIndex = 0; unitIndex < unlockedUnits.length; unitIndex += 1) {
      const secondaryDelta = secondaryDeltaByDateAndUnit[dateIndex][unitIndex];
      if (secondaryDelta === null) {
        continue;
      }
      const encodedDelta = encodeSecondaryTuple(secondaryDelta, weights);
      encodedDeltaByDateAndUnit[dateIndex][unitIndex] = encodedDelta;
      const absolute = Math.abs(encodedDelta);
      if (absolute > maxAbsEncodedDelta) {
        maxAbsEncodedDelta = absolute;
      }
    }
  }
  const secondarySwingBound = 2 * rowCount * maxAbsEncodedDelta;
  const dummyPenalty = secondarySwingBound + 1;
  const infeasibleCost = dummyPenalty + maxAbsEncodedDelta + 1;
  const costByRowColumn = Array.from({ length: rowCount }, (_, dateIndex) => {
    const row = Array.from({ length: columnCount }, () => infeasibleCost);
    for (let unitIndex = 0; unitIndex < unlockedUnits.length; unitIndex += 1) {
      const encodedDelta = encodedDeltaByDateAndUnit[dateIndex][unitIndex];
      if (encodedDelta !== null) {
        row[unitIndex] = encodedDelta;
      }
    }
    for (
      let dummyColumn = unlockedUnits.length;
      dummyColumn < columnCount;
      dummyColumn += 1
    ) {
      row[dummyColumn] = dummyPenalty;
    }
    return row;
  });
  const selectedColumnByDate = solveMinimumCostAssignment(costByRowColumn);
  if (!selectedColumnByDate) {
    return null;
  }

  for (const unit of unlockedUnits) {
    assignedByUnitId.set(getSolverUnitId(unit), null);
  }
  for (let dateIndex = 0; dateIndex < selectedColumnByDate.length; dateIndex += 1) {
    const selectedColumn = selectedColumnByDate[dateIndex];
    if (selectedColumn < unlockedUnits.length) {
      const encodedDelta =
        encodedDeltaByDateAndUnit[dateIndex][selectedColumn];
      if (encodedDelta === null) {
        return null;
      }
      const unit = unlockedUnits[selectedColumn];
      assignedByUnitId.set(getSolverUnitId(unit), availableDates[dateIndex]);
    }
  }

  return units.map((unit) => ({
    goalId: unit.goalId,
    unitKey: unit.unitKey,
    scheduledDate: assignedByUnitId.get(getSolverUnitId(unit)) ?? null,
  }));
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
