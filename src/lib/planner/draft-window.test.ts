import { describe, expect, it } from "vitest";
import {
  plannerDraftWindowUnavailableMessage,
  tryBuildPlannerDraftSaveWindow,
} from "@/lib/planner/draft-window";

const MOVE_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";

describe("tryBuildPlannerDraftSaveWindow", () => {
  it("expands the current month to cover source and destination command dates", () => {
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
      ok: true,
      window: {
        start: "2026-08-01",
        end: "2026-09-30",
      },
    });
  });

  it("keeps the source month after the unit has already moved in preview", () => {
    expect(
      tryBuildPlannerDraftSaveWindow({
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
      ok: true,
      window: {
        start: "2026-08-01",
        end: "2026-09-30",
      },
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
    expect(
      plannerDraftWindowUnavailableMessage({ ok: false, code: "too_wide" })
    ).toBe(
      "That date is more than 12 months from this draft. Save first, then move further."
    );
  });
});
