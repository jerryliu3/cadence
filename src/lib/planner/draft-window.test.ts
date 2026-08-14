import { describe, expect, it } from "vitest";
import { buildPlannerDraftSaveWindow, windowCoveringMonths } from "@/lib/planner/draft-window";

describe("windowCoveringMonths", () => {
  it("unions contiguous months into one inclusive date window", () => {
    expect(windowCoveringMonths(["2026-09", "2026-08"])).toEqual({
      start: "2026-08-01",
      end: "2026-09-30",
    });
  });
});

describe("buildPlannerDraftSaveWindow", () => {
  it("expands the current month to cover source and destination command dates", () => {
    expect(
      buildPlannerDraftSaveWindow({
        currentMonth: "2026-08",
        commands: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            sequence: 1,
            kind: "move_item",
            goalId: "22222222-2222-4222-8222-222222222222",
            unitKey: "total:1",
            scheduledDate: "2026-09-05",
          },
        ],
        workUnits: [
          {
            originalGoalId: "22222222-2222-4222-8222-222222222222",
            unitKey: "total:1",
            scheduledDate: "2026-08-31",
          },
        ],
      })
    ).toEqual({
      start: "2026-08-01",
      end: "2026-09-30",
    });
  });
});
