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
  } as PlannerKernelOutput["workUnits"][number];
}

describe("findUnhonoredDraftPins", () => {
  it("returns nothing when there are no pins", () => {
    expect(
      findUnhonoredDraftPins({
        workUnits: [workUnit("total:1", "2026-08-05")],
        draftPinnedDates: {},
      })
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
      })
    ).toEqual([]);
  });

  it("reports a pin the solver placed elsewhere", () => {
    expect(
      findUnhonoredDraftPins({
        workUnits: [workUnit("total:1", "2026-08-06")],
        draftPinnedDates: { "goal-a:total:1": "2026-08-20" },
      })
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
      })
    ).toEqual([
      {
        goalId: "goal-a",
        unitKey: "total:1",
        expectedDate: "2026-08-20",
        actualDate: null,
      },
    ]);
  });

  it("reports a pin whose unit is absent from the preview", () => {
    expect(
      findUnhonoredDraftPins({
        workUnits: [workUnit("total:1", "2026-08-05")],
        draftPinnedDates: { "goal-a:total:9": "2026-08-20" },
      })
    ).toEqual([
      {
        goalId: "goal-a",
        unitKey: "total:9",
        expectedDate: "2026-08-20",
        actualDate: null,
      },
    ]);
  });
});
