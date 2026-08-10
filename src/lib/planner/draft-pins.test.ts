import { describe, expect, it } from "vitest";
import { findUnhonoredDraftPins } from "@/lib/planner/draft-pins";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";

function workUnit(
  unitKey: string,
  scheduledDate: string | null
): PlannerKernelOutput["workUnits"][number] {
  return {
    originalGoalId: "goal-a",
    unitKey,
    scheduledDate,
    creditState: "uncredited",
    classification: "open",
  } as PlannerKernelOutput["workUnits"][number];
}

describe("findUnhonoredDraftPins", () => {
  it("returns nothing when there are no pins", () => {
    expect(
      findUnhonoredDraftPins({
        workUnits: [workUnit("total:1", "2026-08-05")],
        draftPinnedDates: {},
      }).violations
    ).toEqual([]);
  });

  it("returns nothing when every pin was honored", () => {
    expect(
      findUnhonoredDraftPins({
        workUnits: [
          workUnit("total:1", "2026-08-20"),
          workUnit("total:2", "2026-08-21"),
        ],
        draftPinnedDates: {
          "goal-a:total:1": "2026-08-20",
          "goal-a:total:2": "2026-08-21",
        },
      }).violations
    ).toEqual([]);
  });

  it("reports a pin the solver placed elsewhere", () => {
    expect(
      findUnhonoredDraftPins({
        workUnits: [workUnit("total:1", "2026-08-06")],
        draftPinnedDates: { "goal-a:total:1": "2026-08-20" },
      }).violations
    ).toEqual([
      {
        goalId: "goal-a",
        unitKey: "total:1",
        expectedDate: "2026-08-20",
        actualDate: "2026-08-06",
      },
    ]);
  });

  it("reports a pin the solver could not place at all", () => {
    expect(
      findUnhonoredDraftPins({
        workUnits: [workUnit("total:1", null)],
        draftPinnedDates: { "goal-a:total:1": "2026-08-20" },
      }).violations
    ).toEqual([
      {
        goalId: "goal-a",
        unitKey: "total:1",
        expectedDate: "2026-08-20",
        actualDate: null,
      },
    ]);
  });

});

describe("stale pins are not treated as conflicts", () => {
  function movableUnit(unitKey: string, scheduledDate: string | null) {
    return {
      originalGoalId: "goal-a",
      unitKey,
      scheduledDate,
      creditState: "uncredited",
      classification: "open",
    } as PlannerKernelOutput["workUnits"][number];
  }

  it("treats a pin on a completed unit as stale, not a violation", () => {
    const result = findUnhonoredDraftPins({
      workUnits: [
        {
          ...movableUnit("total:1", "2026-08-06"),
          creditState: "completed_as_scheduled",
        } as PlannerKernelOutput["workUnits"][number],
      ],
      draftPinnedDates: { "goal-a:total:1": "2026-08-20" },
    });

    expect(result.violations).toEqual([]);
    expect(result.stalePins).toEqual(["goal-a:total:1"]);
  });

  it("treats a pin on a vanished unit as stale", () => {
    const result = findUnhonoredDraftPins({
      workUnits: [movableUnit("total:1", "2026-08-06")],
      draftPinnedDates: { "goal-a:total:9": "2026-08-20" },
    });

    expect(result.violations).toEqual([]);
    expect(result.stalePins).toEqual(["goal-a:total:9"]);
  });

  it("still reports a movable unit the solver placed elsewhere", () => {
    const result = findUnhonoredDraftPins({
      workUnits: [movableUnit("total:1", "2026-08-06")],
      draftPinnedDates: { "goal-a:total:1": "2026-08-20" },
    });

    expect(result.stalePins).toEqual([]);
    expect(result.violations).toEqual([
      {
        goalId: "goal-a",
        unitKey: "total:1",
        expectedDate: "2026-08-20",
        actualDate: "2026-08-06",
      },
    ]);
  });
});
