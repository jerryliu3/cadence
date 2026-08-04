import {
  MAX_COMPLETION_FACTS,
  MAX_ELIGIBLE_GOALS,
  MAX_POLICY_RANGES,
  MAX_WORK_UNITS,
} from "../contracts/bounds";
import {
  loadWorstCaseBenchmarkSpec,
} from "../contracts/load-fixtures";

export interface WorstCasePlannerInput {
  scopeMonth: string;
  goals: Array<{
    id: string;
    requirementKind: "deadline_total";
    startDate: string;
    endDate: string;
    targetCount: number;
  }>;
  workUnits: Array<{
    goalIndex: number;
    ordinal: number;
    placementStart: string;
    placementEnd: string;
  }>;
  completionFacts: Array<{
    goalIndex: number;
    completedOn: string;
  }>;
  policyRanges: Array<{
    start: string;
    end: string;
    effect: "avoid" | "prefer";
  }>;
}

function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function materializeWorstCasePlannerInput(): WorstCasePlannerInput {
  const spec = loadWorstCaseBenchmarkSpec();
  const scopeStart = `${spec.scopeMonth}-01`;
  const scopeEnd = addUtcDays(scopeStart, 30);
  const unitsPerGoal = spec.counts.workUnits / spec.counts.goals;
  const factsPerGoal = spec.counts.completionFacts / spec.counts.goals;

  if (
    !Number.isInteger(unitsPerGoal) ||
    !Number.isInteger(factsPerGoal)
  ) {
    throw new Error("Worst-case fixture counts must divide evenly by goals.");
  }

  const goals = Array.from({ length: spec.counts.goals }, (_, goalIndex) => ({
    id: `goal-${String(goalIndex + 1).padStart(3, "0")}`,
    requirementKind: "deadline_total" as const,
    startDate: addUtcDays(scopeStart, -180),
    endDate: scopeEnd,
    targetCount: unitsPerGoal,
  }));

  const workUnits = goals.flatMap((_, goalIndex) =>
    Array.from({ length: unitsPerGoal }, (_, unitIndex) => ({
      goalIndex,
      ordinal: unitIndex + 1,
      placementStart: scopeStart,
      placementEnd: scopeEnd,
    }))
  );

  const completionFacts = goals.flatMap((_, goalIndex) =>
    Array.from({ length: factsPerGoal }, (_, factIndex) => ({
      goalIndex,
      completedOn: addUtcDays(
        scopeStart,
        ((factIndex * 73 + goalIndex + spec.seed) % factsPerGoal) - 170
      ),
    }))
  );

  const policyRanges = Array.from(
    { length: spec.counts.policyRanges },
    (_, rangeIndex) => {
      const dayOffset = rangeIndex % 31;
      const date = addUtcDays(scopeStart, dayOffset);
      return {
        start: date,
        end: date,
        effect: rangeIndex % 2 === 0 ? ("avoid" as const) : ("prefer" as const),
      };
    }
  );

  if (
    goals.length !== MAX_ELIGIBLE_GOALS ||
    workUnits.length !== MAX_WORK_UNITS ||
    completionFacts.length !== MAX_COMPLETION_FACTS ||
    policyRanges.length !== MAX_POLICY_RANGES
  ) {
    throw new Error("Worst-case fixture did not materialize published bounds.");
  }

  return {
    scopeMonth: spec.scopeMonth,
    goals,
    workUnits,
    completionFacts,
    policyRanges,
  };
}

export function serializeCompactWorstCasePlan(input: WorstCasePlannerInput) {
  return JSON.stringify({
    v: 1,
    s: input.scopeMonth,
    i: input.workUnits.map((unit) => [
      unit.goalIndex,
      unit.ordinal,
      unit.ordinal <= 31
        ? `${input.scopeMonth}-${String(unit.ordinal).padStart(2, "0")}`
        : null,
    ]),
  });
}
