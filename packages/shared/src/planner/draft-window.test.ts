import { describe, expect, it } from "vitest";
import {
  PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE,
  plannerDraftWindowUnavailableMessage,
  tryBuildPlannerDraftSaveWindow,
} from "./draft-window";
import type { PlannerMoveItemDraftCommand } from "./reorder-preview-entries";

const move = (
  sourceDate: string,
  scheduledDate: string
): PlannerMoveItemDraftCommand => ({
  id: "11111111-1111-4111-8111-111111111111",
  sequence: 1,
  kind: "move_item",
  goalId: "22222222-2222-4222-8222-222222222222",
  unitKey: "total:1",
  sourceDate,
  scheduledDate,
});

describe("tryBuildPlannerDraftSaveWindow", () => {
  it("covers source and destination months for a cross-month move", () => {
    expect(
      tryBuildPlannerDraftSaveWindow({
        currentMonth: "2026-08",
        commands: [move("2026-08-31", "2026-09-05")],
        workUnits: [],
      })
    ).toEqual({
      ok: true,
      window: { start: "2026-08-01", end: "2026-09-30" },
    });
  });

  it("retains the original month after preview moves the work unit", () => {
    expect(
      tryBuildPlannerDraftSaveWindow({
        currentMonth: "2026-09",
        commands: [move("2026-08-31", "2026-09-05")],
        workUnits: [
          {
            originalGoalId: "22222222-2222-4222-8222-222222222222",
            unitKey: "total:1",
            scheduledDate: "2026-09-05",
          },
        ],
      })
    ).toEqual({
      ok: true,
      window: { start: "2026-08-01", end: "2026-09-30" },
    });
  });

  it("rejects windows wider than the publish boundary", () => {
    const result = tryBuildPlannerDraftSaveWindow({
      currentMonth: "2026-08",
      commands: [move("2026-08-31", "2027-10-05")],
      workUnits: [],
    });

    expect(result).toEqual({ ok: false, code: "too_wide" });
    expect(plannerDraftWindowUnavailableMessage(result)).toBe(
      PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
    );
  });
});
