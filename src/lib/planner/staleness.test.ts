import { describe, expect, it } from "vitest";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";
import {
  evaluateActivePlanStaleness,
  type CurrentPlanSemanticState,
  type PersistedPlanSemanticSnapshot,
  type PlannerGoalSemanticSnapshot,
} from "./staleness";

const fingerprintA = "a".repeat(64);
const fingerprintB = "b".repeat(64);

function semanticGoal(
  overrides: Partial<PlannerGoalSemanticSnapshot> = {}
): PlannerGoalSemanticSnapshot {
  return {
    title: "Goal A",
    category: "fitness",
    color: "#000000",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    requirementFingerprint: fingerprintA,
    assessmentInputHash: fingerprintA,
    assessmentFingerprint: fingerprintA,
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<PersistedPlanSemanticSnapshot> = {}
): PersistedPlanSemanticSnapshot {
  return {
    planId: "plan-a",
    status: "active",
    eligibilityMode: "end_month_v1",
    timezone: "America/New_York",
    policyFingerprint: fingerprintA,
    goals: { "goal-a": semanticGoal() },
    ...overrides,
  };
}

function unit(
  overrides: Partial<PlannerWorkUnit> = {}
): PlannerWorkUnit {
  return {
    originalGoalId: "goal-a",
    requirementSchemaVersion: "1",
    requirementFingerprint: fingerprintA,
    unitKey: "total:1",
    kind: "deadline_total",
    ordinal: 1,
    periodKey: null,
    label: null,
    creditWindow: { start: "2026-08-01", end: "2026-08-31" },
    placementWindow: {
      start: "2026-08-01",
      end: "2026-08-31",
    },
    classification: "open",
    missPolicy: "roll_forward",
    restEligible: true,
    maxPerDay: 1,
    creditedCompletionId: null,
    creditedCompletionDate: null,
    creditState: "uncredited",
    scheduledDate: "2026-08-20",
    locked: false,
    ...overrides,
  };
}

function current(
  overrides: Partial<CurrentPlanSemanticState> = {}
): CurrentPlanSemanticState {
  return {
    eligibilityMode: "end_month_v1",
    timezone: "America/New_York",
    policyFingerprint: fingerprintA,
    goals: { "goal-a": semanticGoal() },
    linkedGoalIds: [],
    workUnits: [unit()],
    driftFacts: [],
    invalidGoalIds: [],
    localToday: "2026-08-10",
    ...overrides,
  };
}

describe("active plan semantic staleness", () => {
  it("keeps expected progress and accepted execution edits fresh", () => {
    expect(
      evaluateActivePlanStaleness({
        snapshot: snapshot(),
        current: current({
          workUnits: [
            unit({
              scheduledDate: "2026-08-12",
              locked: true,
              classification: "fulfilled",
              creditedCompletionId: "completion-a",
              creditedCompletionDate: "2026-08-12",
              creditState: "completed_as_scheduled",
            }),
          ],
        }),
      })
    ).toEqual({ status: "fresh", stale: false, reasons: [] });
  });

  it("reports changed, added, and orphaned goal requirements", () => {
    const result = evaluateActivePlanStaleness({
      snapshot: snapshot({
        goals: {
          "goal-a": semanticGoal(),
          "goal-removed": semanticGoal({ title: "Removed" }),
        },
      }),
      current: current({
        goals: {
          "goal-a": semanticGoal({ assessmentFingerprint: fingerprintB }),
          "goal-added": semanticGoal({ title: "Added" }),
        },
      }),
    });

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "goal_changed", goalId: "goal-a" }),
        expect.objectContaining({ code: "goal_added", goalId: "goal-added" }),
        expect.objectContaining({
          code: "orphaned_goal",
          goalId: "goal-removed",
        }),
      ])
    );
  });

  it("treats metadata-only goal edits as semantic changes", () => {
    const result = evaluateActivePlanStaleness({
      snapshot: snapshot(),
      current: current({
        goals: {
          "goal-a": semanticGoal({
            title: "Renamed goal",
            color: "#ffffff",
          }),
        },
      }),
    });

    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "goal_changed", goalId: "goal-a" }),
    ]);
  });

  it("reports policy, timezone, and link semantic changes", () => {
    const result = evaluateActivePlanStaleness({
      snapshot: snapshot(),
      current: current({
        timezone: "UTC",
        policyFingerprint: fingerprintB,
        linkedGoalIds: ["goal-a", "unplanned-goal"],
      }),
    });

    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "link_changed",
      "policy_changed",
      "timezone_changed",
    ]);
  });

  it("maps completion reconciliation drift to stable reasons", () => {
    const result = evaluateActivePlanStaleness({
      snapshot: snapshot(),
      current: current({
        driftFacts: [
          {
            completionId: "completion-a",
            completedOn: "2026-08-01",
            driftType: "inadmissible",
          },
          {
            completionId: "completion-b",
            completedOn: "2026-08-02",
            driftType: "out_of_plan",
          },
          {
            completionId: "completion-c",
            completedOn: "2026-08-03",
            driftType: "credited_work_removed",
          },
          {
            completionId: "completion-d",
            completedOn: "2026-08-04",
            driftType: "credited_work_reassigned",
          },
        ],
      }),
    });

    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "credited_work_reassigned",
      "credited_work_removed",
      "inadmissible_fact",
      "out_of_plan_fact",
    ]);
  });

  it("uses the current plan-local date for overdue work", () => {
    const result = evaluateActivePlanStaleness({
      snapshot: snapshot(),
      current: current({
        localToday: "2026-08-21",
        workUnits: [
          unit({ scheduledDate: "2026-08-20" }),
          unit({
            unitKey: "total:2",
            ordinal: 2,
            scheduledDate: null,
            placementWindow: {
              start: "2026-08-01",
              end: "2026-08-19",
            },
          }),
          unit({
            unitKey: "total:3",
            ordinal: 3,
            scheduledDate: "2026-08-18",
            classification: "fulfilled",
            creditedCompletionId: "completion-c",
            creditedCompletionDate: "2026-08-18",
            creditState: "completed_as_scheduled",
          }),
        ],
      }),
    });

    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "overdue_item", unitKey: "total:1" }),
      expect.objectContaining({ code: "overdue_item", unitKey: "total:2" }),
    ]);
  });

  it("reports invalid locks without comparing valid locks", () => {
    const result = evaluateActivePlanStaleness({
      snapshot: snapshot(),
      current: current({ invalidGoalIds: ["goal-a"] }),
    });

    expect(result.reasons).toEqual([
      expect.objectContaining({ code: "invalid_lock", goalId: "goal-a" }),
    ]);
  });

  it("does not evaluate inactive historical plans", () => {
    expect(
      evaluateActivePlanStaleness({
        snapshot: snapshot({ status: "superseded" }),
        current: current({
          timezone: "UTC",
          invalidGoalIds: ["goal-a"],
        }),
      })
    ).toEqual({
      status: "not_applicable",
      stale: false,
      reasons: [],
    });
  });
});
