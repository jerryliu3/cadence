import {
  MAX_COMPLETION_FACTS,
  MAX_ELIGIBLE_GOALS,
  MAX_POLICY_RANGES,
  MAX_WORK_UNITS,
} from "../contracts/bounds";
import {
  loadWorstCaseBenchmarkSpec,
} from "../contracts/load-fixtures";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import type { PlannerKernelInput, PlannerKernelOutput } from "@/lib/planner/kernel";
import { computeRequirementFingerprint } from "@/lib/planner/requirements";

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
    id: `goal-${String(goalIndex + 1).padStart(3, "0")}`.padEnd(
      100,
      "x"
    ),
    requirementKind: "deadline_total" as const,
    startDate: scopeStart,
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
        ((factIndex * 73 + goalIndex + spec.seed) % factsPerGoal) -
          factsPerGoal
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

export function materializeWorstCaseKernelInput({
  withBasePlan = false,
  replaceLineage = false,
}: {
  withBasePlan?: boolean;
  replaceLineage?: boolean;
} = {}): PlannerKernelInput {
  const input = materializeWorstCasePlannerInput();
  const ownerId = "benchmark-owner";
  const confirmedAt = `${input.scopeMonth}-01T00:00:00.000Z`;
  const policy = createDefaultPlannerPolicy("UTC", confirmedAt);
  policy.datePreferences = input.policyRanges.map((range) => ({
    goalId: null,
    ...range,
  }));

  const goals: PlannerKernelInput["goals"] = input.goals.map((goal) => ({
    id: goal.id,
    owner_id: ownerId,
    title: `Benchmark goal ${goal.id}`,
    description: null,
    category: "Benchmark",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: goal.targetCount,
    milestone_names: null,
    start_date: goal.startDate,
    end_date: goal.endDate,
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: confirmedAt,
    updated_at: confirmedAt,
  }));
  const fingerprints = goals.map(computeRequirementFingerprint);

  return {
    schemaVersion: "1",
    eligibilityMode: "end_month_v1",
    ownerId,
    scopeMonth: input.scopeMonth,
    asOfDate: `${input.scopeMonth}-01`,
    timezone: "UTC",
    goals,
    completions: input.completionFacts.map((fact, index) => ({
      id: `completion-${String(index + 1).padStart(5, "0")}`,
      goal_id: input.goals[fact.goalIndex].id,
      user_id: ownerId,
      completed_on: fact.completedOn,
      source: "manual",
      created_at: `${fact.completedOn}T12:00:00.000Z`,
    })),
    links: [],
    policy,
    basePlan: withBasePlan
      ? {
          planId: "benchmark-base-plan",
          version: 1,
          assignments: input.workUnits.map((unit) => ({
            goalId: goals[unit.goalIndex].id,
            requirementFingerprint: replaceLineage
              ? "f".repeat(64)
              : fingerprints[unit.goalIndex],
            unitKey: `total:${unit.ordinal}`,
            scheduledDate:
              unit.ordinal <= 31
                ? `${input.scopeMonth}-${String(unit.ordinal).padStart(
                    2,
                    "0"
                  )}`
                : null,
            locked: false,
          })),
          completionToUnit: {},
          issueCodes: ["placement_shortfall"],
        }
      : null,
  };
}

export function serializeCompactPlannerOutput(output: PlannerKernelOutput) {
  const goalIds = Array.from(
    new Set([
      ...output.workUnits.map((unit) => unit.originalGoalId),
      ...output.eligibility.map((entry) => entry.goalId),
      ...output.diff.flatMap((entry) =>
        entry.goalId === null ? [] : [entry.goalId]
      ),
    ])
  ).sort();
  const lineages = Array.from(
    new Set([
      ...output.workUnits.map((unit) => unit.requirementFingerprint),
      ...output.diff.flatMap((entry) =>
        entry.requirementFingerprint === null
          ? []
          : [entry.requirementFingerprint]
      ),
    ])
  ).sort();
  const goalIndex = new Map(goalIds.map((goalId, index) => [goalId, index]));
  const lineageIndex = new Map(
    lineages.map((lineage, index) => [lineage, index])
  );
  const driftCounts = Object.fromEntries(
    Array.from(
      output.driftFacts.reduce((counts, drift) => {
        counts.set(drift.driftType, (counts.get(drift.driftType) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
    ).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  );

  return JSON.stringify({
    v: output.schemaVersion,
    e: output.eligibilityMode,
    h: output.generationInputHash,
    s: output.scopeState,
    p: output.solver.placementStatus,
    q: output.solver.searchStatus,
    c: output.solver.capacityStatus,
    i: output.solver.issueCodes,
    k: output.solver.invalidGoalIds.map((goalId) => goalIndex.get(goalId)),
    u: output.solver.publishable,
    r: output.solver.confirmationRequired,
    o: goalIds,
    l: lineages,
    d: output.diff.map((entry) => [
      entry.kind,
      entry.goalId === null ? null : goalIndex.get(entry.goalId),
      entry.requirementFingerprint === null
        ? null
        : lineageIndex.get(entry.requirementFingerprint),
      entry.unitKey,
      entry.fromDate,
      entry.toDate,
      entry.issueCode,
    ]),
    x: output.validation,
    g: output.suggestedRelaxations,
    f: driftCounts,
    y: output.eligibility.map((entry) => [
      goalIndex.get(entry.goalId),
      entry.eligible,
      entry.reason,
    ]),
    a: output.workUnits.map((unit) => [
      goalIndex.get(unit.originalGoalId),
      lineageIndex.get(unit.requirementFingerprint),
      unit.unitKey,
      unit.classification,
      unit.scheduledDate,
    ]),
  });
}
