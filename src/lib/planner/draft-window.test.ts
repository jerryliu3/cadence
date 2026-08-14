import { describe, expect, it } from "vitest";
import {
  buildPlannerDraftSaveWindow,
  tryBuildPlannerDraftSaveWindow,
  windowCoveringMonths,
} from "@/lib/planner/draft-window";

const MOVE_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";

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
            id: MOVE_ID,
            sequence: 1,
            kind: "move_item",
            goalId: GOAL_ID,
            unitKey: "total:1",
            scheduledDate: "2026-09-05",
            sourceDate: "2026-08-31",
          },
        ],
        workUnits: [
          {
            originalGoalId: GOAL_ID,
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

  it("keeps the source month after the unit has already moved in preview", () => {
    expect(
      buildPlannerDraftSaveWindow({
        currentMonth: "2026-09",
        commands: [
          {
            id: MOVE_ID,
            sequence: 1,
            kind: "move_item",
            goalId: GOAL_ID,
            unitKey: "total:1",
            scheduledDate: "2026-09-05",
            sourceDate: "2026-08-31",
          },
        ],
        workUnits: [
          {
            originalGoalId: GOAL_ID,
            unitKey: "total:1",
            scheduledDate: "2026-09-05",
          },
        ],
      })
    ).toEqual({
      start: "2026-08-01",
      end: "2026-09-30",
    });
  });

  it("does not throw when a 14-month span would exceed the publish cap", () => {
    expect(
      tryBuildPlannerDraftSaveWindow({
        currentMonth: "2026-08",
        commands: [
          {
            id: MOVE_ID,
            sequence: 1,
            kind: "move_item",
            goalId: GOAL_ID,
            unitKey: "total:1",
            scheduledDate: "2027-10-05",
            sourceDate: "2026-08-31",
          },
        ],
        workUnits: [],
      })
    ).toEqual({ ok: false, code: "too_wide" });
  });
});
