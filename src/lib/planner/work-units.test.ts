import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import { reconcilePlannerCompletions } from "@/lib/planner/reconciliation";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";
import {
  materializeWorkUnits,
  type PlannerBaseAssignment,
} from "@/lib/planner/work-units";

function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-id",
    owner_id: "owner-id",
    title: "Goal",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: null,
    milestone_names: null,
    start_date: "2026-07-29",
    end_date: "2026-08-31",
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-07-29T00:00:00Z",
    updated_at: "2026-07-29T00:00:00Z",
    ...overrides,
  };
}

function completion(date: string, id = date): Completion {
  return {
    id,
    goal_id: "goal-id",
    user_id: "owner-id",
    completed_on: date,
    source: "manual",
    created_at: `${date}T12:00:00Z`,
  };
}

function allOrdinals(goal: Goal) {
  return new Set(
    Array.from({ length: Math.max(goal.target_count ?? 0, 0) }, (_, index) => index + 1)
  );
}

describe("end-month planner work units", () => {
  it("materializes open-ended cadence goals month-locally", () => {
    const goal = buildGoal({ end_date: null });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-08-01",
    });

    expect(units.map((unit) => unit.unitKey)).toEqual([
      "cadence:2026-07-29",
      "cadence:2026-08-05",
      "cadence:2026-08-12",
      "cadence:2026-08-19",
      "cadence:2026-08-26",
    ]);
    expect(units.at(-1)?.creditWindow).toEqual({
      start: "2026-08-26",
      end: "2026-08-31",
    });
  });

  it("owns boundary cadence windows by clipped scope intersection", () => {
    const goal = buildGoal();
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-08-01",
    });

    expect(units.map((unit) => unit.unitKey)).toEqual([
      "cadence:2026-07-29",
      "cadence:2026-08-05",
      "cadence:2026-08-12",
      "cadence:2026-08-19",
      "cadence:2026-08-26",
    ]);
    expect(units[0]).toMatchObject({
      creditWindow: { start: "2026-07-29", end: "2026-08-04" },
      placementWindow: { start: "2026-08-01", end: "2026-08-04" },
      classification: "open",
      missPolicy: "remain_missed",
    });
    expect(units.at(-1)?.creditWindow).toEqual({
      start: "2026-08-26",
      end: "2026-08-31",
    });
  });

  it("materializes every stable total ordinal, including shortfall rows", () => {
    const goal = buildGoal({
      target_count: 3,
      start_date: "2026-08-01",
    });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-08-05",
      ordinalsForScopeMonth: allOrdinals(goal),
    });

    expect(units.map((unit) => unit.unitKey)).toEqual([
      "total:1",
      "total:2",
      "total:3",
    ]);
    expect(units.every((unit) => unit.placementWindow?.start === "2026-08-05")).toBe(
      true
    );
  });

  it("requires explicit ordinal scope allocation for ordinal goals", () => {
    const totalGoal = buildGoal({
      target_count: 2,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });

    expect(() =>
      materializeWorkUnits({
        goal: totalGoal,
        normalizedRequirement: normalizeGoalRequirement(totalGoal),
        scopeMonth: "2026-08",
        asOfDate: "2026-08-05",
      })
    ).toThrowError("Planner ordinal work units require an explicit ordinal scope allocation.");
  });

  it("respects explicit ordinal scope allocation overrides", () => {
    const goal = buildGoal({
      target_count: 6,
      start_date: "2026-08-01",
      end_date: "2026-10-31",
    });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-09",
      asOfDate: "2026-08-05",
      ordinalsForScopeMonth: new Set([2, 5]),
    });

    expect(units.map((unit) => unit.unitKey)).toEqual(["total:2", "total:5"]);
  });

  it("classifies non-placeable historical totals explicitly", () => {
    const goal = buildGoal({
      target_count: 2,
      start_date: "2026-08-01",
    });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-09-01",
      ordinalsForScopeMonth: allOrdinals(goal),
    });

    expect(units.map((unit) => unit.classification)).toEqual([
      "historical_shortfall",
      "historical_shortfall",
    ]);
    expect(units.every((unit) => unit.placementWindow === null)).toBe(true);
  });

  it("classifies expired cadence obligations as historical misses", () => {
    const goal = buildGoal();
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-08-12",
    });

    expect(units[0].classification).toBe("historical_miss");
    expect(units[1].classification).toBe("historical_miss");
    expect(units[2].classification).toBe("open");
  });

  it("keeps cadence draft move windows month-bounded in end-month mode", () => {
    const goal = buildGoal({ end_date: "2026-09-30" });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      eligibilityMode: "end_month_v1",
      scopeMonth: "2026-08",
      asOfDate: "2026-08-01",
    });

    const boundaryUnit = units.find((unit) => unit.unitKey === "cadence:2026-08-26");
    expect(boundaryUnit?.placementWindow).toEqual({
      start: "2026-08-26",
      end: "2026-08-31",
    });
    expect(boundaryUnit?.draftMoveWindow).toEqual({
      start: "2026-08-26",
      end: "2026-08-31",
    });
  });
});

describe("overlap planner draft move windows", () => {
  it("extends cadence draft move windows into overlap credit days", () => {
    const goal = buildGoal({ end_date: "2026-09-30" });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      eligibilityMode: "overlap_v1",
      scopeMonth: "2026-08",
      asOfDate: "2026-08-01",
    });

    const boundaryUnit = units.find((unit) => unit.unitKey === "cadence:2026-08-26");
    expect(boundaryUnit?.placementWindow).toEqual({
      start: "2026-08-26",
      end: "2026-08-31",
    });
    expect(boundaryUnit?.draftMoveWindow).toEqual({
      start: "2026-08-26",
      end: "2026-09-01",
    });
  });
});

describe("planner time defaults", () => {
  it("uses goal default time when no item override exists", () => {
    const goal = buildGoal({
      recurrence_interval: "daily",
      target_count: 1,
      start_date: "2026-08-01",
      default_local_time: "09:15",
    });
    const requirement = normalizeGoalRequirement(goal);
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: requirement,
      scopeMonth: "2026-08",
      asOfDate: "2026-08-01",
      ordinalsForScopeMonth: allOrdinals(goal),
      baseAssignments: [
        {
          goalId: goal.id,
          requirementFingerprint: requirement.requirementFingerprint,
          unitKey: "total:1",
          scheduledDate: "2026-08-12",
          locked: false,
          scheduledTimeOverride: null,
        },
      ],
    });

    expect(units[0]).toMatchObject({
      goalDefaultLocalTime: "09:15",
      scheduledTimeOverride: null,
      effectiveScheduledLocalTime: "09:15",
      effectiveScheduledAtLocal: "2026-08-12T09:15:00",
    });
  });

  it("prefers item override over goal default time", () => {
    const goal = buildGoal({
      recurrence_interval: "daily",
      target_count: 1,
      start_date: "2026-08-01",
      default_local_time: "09:15",
    });
    const requirement = normalizeGoalRequirement(goal);
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: requirement,
      scopeMonth: "2026-08",
      asOfDate: "2026-08-01",
      ordinalsForScopeMonth: allOrdinals(goal),
      baseAssignments: [
        {
          goalId: goal.id,
          requirementFingerprint: requirement.requirementFingerprint,
          unitKey: "total:1",
          scheduledDate: "2026-08-12",
          locked: false,
          scheduledTimeOverride: "18:20",
        },
      ],
    });

    expect(units[0]).toMatchObject({
      goalDefaultLocalTime: "09:15",
      scheduledTimeOverride: "18:20",
      effectiveScheduledLocalTime: "18:20",
      effectiveScheduledAtLocal: "2026-08-12T18:20:00",
    });
  });
});

describe("planner completion reconciliation", () => {
  it("matches deadline totals scheduled-date-first, then chronologically", () => {
    const goal = buildGoal({
      target_count: 3,
      start_date: "2026-08-01",
    });
    const baseAssignments: PlannerBaseAssignment[] = [
      ["total:1", "2026-08-05"],
      ["total:2", "2026-08-10"],
      ["total:3", "2026-08-15"],
    ].map(([unitKey, scheduledDate]) => ({
      goalId: goal.id,
      requirementFingerprint:
        normalizeGoalRequirement(goal).requirementFingerprint,
      unitKey,
      scheduledDate,
      locked: false,
    }));
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-08-20",
      ordinalsForScopeMonth: allOrdinals(goal),
      baseAssignments,
    });
    const result = reconcilePlannerCompletions({
      goal,
      workUnits: units,
      completions: [
        completion("2026-08-10", "scheduled"),
        completion("2026-08-07", "chronological"),
      ],
      asOfDate: "2026-08-20",
    });

    expect(result.completionToUnit).toEqual({
      scheduled: {
        goalId: goal.id,
        requirementFingerprint:
          normalizeGoalRequirement(goal).requirementFingerprint,
        unitKey: "total:2",
        completedOn: "2026-08-10",
      },
      chronological: {
        goalId: goal.id,
        requirementFingerprint:
          normalizeGoalRequirement(goal).requirementFingerprint,
        unitKey: "total:1",
        completedOn: "2026-08-07",
      },
    });
    expect(result.units.map((unit) => unit.classification)).toEqual([
      "satisfied_elsewhere",
      "fulfilled",
      "open",
    ]);
  });

  it("preserves prior deadline-total completion identity when still valid", () => {
    const goal = buildGoal({
      target_count: 2,
      start_date: "2026-08-01",
    });
    const normalizedRequirement = normalizeGoalRequirement(goal);
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement,
      scopeMonth: "2026-08",
      asOfDate: "2026-08-20",
      ordinalsForScopeMonth: allOrdinals(goal),
      baseAssignments: [
        {
          goalId: goal.id,
          requirementFingerprint: normalizedRequirement.requirementFingerprint,
          unitKey: "total:1",
          scheduledDate: "2026-08-05",
          locked: false,
        },
        {
          goalId: goal.id,
          requirementFingerprint: normalizedRequirement.requirementFingerprint,
          unitKey: "total:2",
          scheduledDate: "2026-08-10",
          locked: false,
        },
      ],
    });
    const result = reconcilePlannerCompletions({
      goal,
      workUnits: units,
      completions: [completion("2026-08-07", "sticky")],
      asOfDate: "2026-08-20",
      previousCompletionToUnit: {
        sticky: {
          goalId: goal.id,
          requirementFingerprint: normalizedRequirement.requirementFingerprint,
          unitKey: "total:2",
          completedOn: "2026-08-07",
        },
      },
    });

    expect(result.completionToUnit.sticky).toEqual({
      goalId: goal.id,
      requirementFingerprint: normalizedRequirement.requirementFingerprint,
      unitKey: "total:2",
      completedOn: "2026-08-07",
    });
    expect(result.driftFacts).toEqual([]);
    expect(
      result.units.find((unit) => unit.unitKey === "total:2")
    ).toMatchObject({
      classification: "satisfied_elsewhere",
      creditState: "completed_elsewhere",
      creditedCompletionId: "sticky",
    });
  });

  it("maps milestones chronologically and never scheduled-first", () => {
    const goal = buildGoal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 2,
      milestone_names: ["First", "Second"],
      start_date: "2026-08-01",
    });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-08-20",
      ordinalsForScopeMonth: allOrdinals(goal),
      baseAssignments: [
        {
          goalId: goal.id,
          requirementFingerprint:
            normalizeGoalRequirement(goal).requirementFingerprint,
          unitKey: "milestone:2",
          scheduledDate: "2026-08-05",
          locked: false,
        },
      ],
    });
    const result = reconcilePlannerCompletions({
      goal,
      workUnits: units,
      completions: [
        completion("2026-08-10", "later"),
        completion("2026-08-05", "earlier"),
      ],
      asOfDate: "2026-08-20",
    });

    expect(result.completionToUnit).toEqual({
      earlier: {
        goalId: goal.id,
        requirementFingerprint:
          normalizeGoalRequirement(goal).requirementFingerprint,
        unitKey: "milestone:1",
        completedOn: "2026-08-05",
      },
      later: {
        goalId: goal.id,
        requirementFingerprint:
          normalizeGoalRequirement(goal).requirementFingerprint,
        unitKey: "milestone:2",
        completedOn: "2026-08-10",
      },
    });
  });

  it("types inadmissible and excess canonical facts as drift", () => {
    const goal = buildGoal({
      target_count: 1,
      start_date: "2026-08-01",
    });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-08-20",
      ordinalsForScopeMonth: allOrdinals(goal),
    });
    const result = reconcilePlannerCompletions({
      goal,
      workUnits: units,
      completions: [
        completion("2026-07-31", "before"),
        completion("2026-08-05", "credited"),
        completion("2026-08-06", "extra"),
      ],
      asOfDate: "2026-08-20",
    });

    expect(result.driftFacts).toEqual([
      {
        completionId: "before",
        completedOn: "2026-07-31",
        driftType: "inadmissible",
      },
      {
        completionId: "extra",
        completedOn: "2026-08-06",
        driftType: "out_of_plan",
      },
    ]);
  });

  it("does not type cadence facts from unowned earlier periods as drift", () => {
    const goal = buildGoal({ start_date: "2026-07-01" });
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalizeGoalRequirement(goal),
      scopeMonth: "2026-08",
      asOfDate: "2026-08-20",
    });
    const result = reconcilePlannerCompletions({
      goal,
      workUnits: units,
      completions: [completion("2026-07-02", "earlier-scope")],
      asOfDate: "2026-08-20",
    });

    expect(result.driftFacts).toEqual([]);
  });

  it("treats off-schedule cadence credit as period fulfillment", () => {
    const goal = buildGoal();
    const normalized = normalizeGoalRequirement(goal);
    const units = materializeWorkUnits({
      goal,
      normalizedRequirement: normalized,
      scopeMonth: "2026-08",
      asOfDate: "2026-08-10",
      baseAssignments: [
        {
          goalId: goal.id,
          requirementFingerprint: normalized.requirementFingerprint,
          unitKey: "cadence:2026-07-29",
          scheduledDate: "2026-08-01",
          locked: false,
        },
      ],
    });
    const result = reconcilePlannerCompletions({
      goal,
      workUnits: units,
      completions: [completion("2026-08-02", "off-schedule")],
      asOfDate: "2026-08-10",
    });

    expect(result.units[0]).toMatchObject({
      classification: "fulfilled",
      creditState: "completed_elsewhere",
    });
  });
});
