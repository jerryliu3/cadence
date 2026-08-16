import { describe, expect, it } from "vitest";
import { countDateWindowDays, isMonthAlignedPlannerWindow } from "@/lib/planner/dates";
import { MAX_PLANNER_WINDOW_DAYS } from "@/lib/planner/contracts/bounds";
import {
  buildPlannerRecoveryPlan,
  buildPlannerRecoveryWindow,
  describePlannerRecoveryOutcome,
  PLANNER_RECOVERY_WINDOW_MONTHS,
  type PlannerRecoveryUnitSnapshot,
} from "@/lib/planner/recovery";

function unit(
  overrides: Partial<PlannerRecoveryUnitSnapshot> &
    Pick<PlannerRecoveryUnitSnapshot, "unitKey">
): PlannerRecoveryUnitSnapshot {
  return {
    originalGoalId: "goal-a",
    scheduledDate: null,
    creditState: "uncredited",
    ...overrides,
  };
}

describe("buildPlannerRecoveryWindow", () => {
  it("spans whole months around today and stays inside the publish bound", () => {
    const window = buildPlannerRecoveryWindow("2026-08-16");
    expect(window).toEqual({ start: "2026-02-01", end: "2027-01-31" });
    expect(isMonthAlignedPlannerWindow(window)).toBe(true);
    expect(countDateWindowDays(window)).toBeLessThanOrEqual(
      MAX_PLANNER_WINDOW_DAYS
    );
  });

  it("stays inside the publish bound across a leap year", () => {
    for (const asOfDate of [
      "2027-09-04",
      "2028-01-31",
      "2028-02-29",
      "2028-07-01",
      "2028-12-31",
    ]) {
      const window = buildPlannerRecoveryWindow(asOfDate);
      expect(isMonthAlignedPlannerWindow(window)).toBe(true);
      expect(countDateWindowDays(window)).toBeLessThanOrEqual(
        MAX_PLANNER_WINDOW_DAYS
      );
      expect(window.start <= asOfDate && asOfDate <= window.end).toBe(true);
    }
  });

  it("crosses the year boundary without drifting", () => {
    expect(buildPlannerRecoveryWindow("2026-01-05")).toEqual({
      start: "2025-07-01",
      end: "2026-06-30",
    });
    expect(PLANNER_RECOVERY_WINDOW_MONTHS).toBe(12);
  });
});

describe("buildPlannerRecoveryPlan", () => {
  const asOfDate = "2026-08-16";

  it("moves a stranded session the recovery solve pulled forward", () => {
    const plan = buildPlannerRecoveryPlan({
      baselineUnits: [unit({ unitKey: "milestone:2", scheduledDate: "2026-07-04" })],
      recoveredUnits: [unit({ unitKey: "milestone:2", scheduledDate: "2026-09-10" })],
      asOfDate,
    });

    expect(plan.moves).toEqual([
      {
        goalId: "goal-a",
        unitKey: "milestone:2",
        sourceDate: "2026-07-04",
        scheduledDate: "2026-09-10",
      },
    ]);
    expect(plan.strandedCount).toBe(1);
    expect(plan.unrecoverableCount).toBe(0);
  });

  it("counts a stranded session the solver could not place as unrecoverable", () => {
    const plan = buildPlannerRecoveryPlan({
      baselineUnits: [
        unit({ unitKey: "cadence:2026-W28", scheduledDate: "2026-07-08" }),
      ],
      recoveredUnits: [
        unit({ unitKey: "cadence:2026-W28", scheduledDate: "2026-07-08" }),
      ],
      asOfDate,
    });

    expect(plan.moves).toEqual([]);
    expect(plan.strandedCount).toBe(1);
    expect(plan.unrecoverableCount).toBe(1);
  });

  it("treats an unplaced recovery result as unrecoverable rather than a move", () => {
    const plan = buildPlannerRecoveryPlan({
      baselineUnits: [unit({ unitKey: "total:3", scheduledDate: "2026-07-04" })],
      recoveredUnits: [unit({ unitKey: "total:3", scheduledDate: null })],
      asOfDate,
    });

    expect(plan.moves).toEqual([]);
    expect(plan.unrecoverableCount).toBe(1);
  });

  it("ignores sessions that are already credited", () => {
    const plan = buildPlannerRecoveryPlan({
      baselineUnits: [
        unit({
          unitKey: "milestone:1",
          scheduledDate: "2026-07-04",
          creditState: "completed_as_scheduled",
        }),
      ],
      recoveredUnits: [
        unit({
          unitKey: "milestone:1",
          scheduledDate: "2026-09-10",
          creditState: "completed_as_scheduled",
        }),
      ],
      asOfDate,
    });

    expect(plan.moves).toEqual([]);
    expect(plan.strandedCount).toBe(0);
  });

  it("ignores sessions that are not in the past", () => {
    const plan = buildPlannerRecoveryPlan({
      baselineUnits: [
        unit({ unitKey: "today", scheduledDate: asOfDate }),
        unit({ unitKey: "later", scheduledDate: "2026-09-01" }),
      ],
      recoveredUnits: [
        unit({ unitKey: "today", scheduledDate: "2026-09-20" }),
        unit({ unitKey: "later", scheduledDate: "2026-09-21" }),
      ],
      asOfDate,
    });

    expect(plan.moves).toEqual([]);
    expect(plan.strandedCount).toBe(0);
  });

  it("never proposes a target that is still in the past", () => {
    const plan = buildPlannerRecoveryPlan({
      baselineUnits: [unit({ unitKey: "total:1", scheduledDate: "2026-07-04" })],
      recoveredUnits: [unit({ unitKey: "total:1", scheduledDate: "2026-07-20" })],
      asOfDate,
    });

    expect(plan.moves).toEqual([]);
    expect(plan.unrecoverableCount).toBe(1);
  });

  it("orders moves by target date and reports a mixed outcome", () => {
    const plan = buildPlannerRecoveryPlan({
      baselineUnits: [
        unit({ unitKey: "total:1", scheduledDate: "2026-07-04" }),
        unit({ unitKey: "total:2", scheduledDate: "2026-07-05" }),
        unit({
          originalGoalId: "goal-b",
          unitKey: "cadence:2026-W28",
          scheduledDate: "2026-07-08",
        }),
      ],
      recoveredUnits: [
        unit({ unitKey: "total:1", scheduledDate: "2026-09-20" }),
        unit({ unitKey: "total:2", scheduledDate: "2026-08-30" }),
        unit({
          originalGoalId: "goal-b",
          unitKey: "cadence:2026-W28",
          scheduledDate: "2026-07-08",
        }),
      ],
      asOfDate,
    });

    expect(plan.moves.map((move) => move.unitKey)).toEqual([
      "total:2",
      "total:1",
    ]);
    expect(plan.strandedCount).toBe(3);
    expect(plan.unrecoverableCount).toBe(1);
  });
});

describe("describePlannerRecoveryOutcome", () => {
  it("reports a clean calendar", () => {
    expect(
      describePlannerRecoveryOutcome({
        moves: [],
        strandedCount: 0,
        unrecoverableCount: 0,
      })
    ).toBe("No past sessions need recovering.");
  });

  it("explains when nothing can be pulled forward", () => {
    expect(
      describePlannerRecoveryOutcome({
        moves: [],
        strandedCount: 2,
        unrecoverableCount: 2,
      })
    ).toContain("2 past sessions can no longer be moved forward");
  });

  it("reports moves and leftovers together", () => {
    const message = describePlannerRecoveryOutcome({
      moves: [
        {
          goalId: "goal-a",
          unitKey: "total:1",
          sourceDate: "2026-07-04",
          scheduledDate: "2026-09-20",
        },
      ],
      strandedCount: 2,
      unrecoverableCount: 1,
    });
    expect(message).toContain("Moved 1 past session forward");
    expect(message).toContain("1 could not be moved");
  });
});
