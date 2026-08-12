import { describe, expect, it } from "vitest";
import type { PlannerWorkUnit } from "@/lib/planner/work-units";
import { validateMergedWorkUnitAssignments } from "./validation";

function createWorkUnit(
  overrides: Partial<PlannerWorkUnit> = {}
): PlannerWorkUnit {
  return {
    originalGoalId: "goal-a",
    requirementSchemaVersion: "1",
    requirementFingerprint: "req-fp",
    unitKey: "total:1",
    kind: "deadline_total",
    ordinal: 1,
    periodKey: null,
    label: null,
    creditWindow: { start: "2026-08-01", end: "2026-08-31" },
    placementWindow: { start: "2026-08-20", end: "2026-08-31" },
    draftMoveWindow: { start: "2026-08-20", end: "2026-08-31" },
    classification: "open",
    missPolicy: "roll_forward",
    restEligible: true,
    maxPerDay: 1,
    creditedCompletionId: null,
    creditedCompletionDate: null,
    creditState: "uncredited",
    scheduledDate: null,
    locked: false,
    ...overrides,
  };
}

describe("validateMergedWorkUnitAssignments", () => {
  it("allows retained open-unit dates before the placement window start", () => {
    const result = validateMergedWorkUnitAssignments([
      createWorkUnit({ scheduledDate: "2026-08-05" }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.invariantViolations).toEqual([]);
  });

  it("rejects open-unit dates after the placement window end", () => {
    const result = validateMergedWorkUnitAssignments([
      createWorkUnit({ scheduledDate: "2026-09-01" }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.invariantViolations).toContain(
      "date_outside_placement_window"
    );
  });

  it("rejects open-unit dates when the placement window is null", () => {
    const result = validateMergedWorkUnitAssignments([
      createWorkUnit({
        scheduledDate: "2026-08-05",
        placementWindow: null,
      }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.invariantViolations).toContain(
      "date_outside_placement_window"
    );
  });

  it("still rejects duplicate goal dates even when one is pre-window", () => {
    const result = validateMergedWorkUnitAssignments([
      createWorkUnit({
        unitKey: "total:1",
        ordinal: 1,
        scheduledDate: "2026-08-05",
      }),
      createWorkUnit({
        unitKey: "total:2",
        ordinal: 2,
        scheduledDate: "2026-08-05",
      }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.invariantViolations).toContain("duplicate_goal_date");
  });
});
