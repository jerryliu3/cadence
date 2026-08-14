import { describe, expect, it } from "vitest";
import { createEmptyMobilePlannerDraft } from "./mobile-planner-draft";
import { DraftMoveError, planMobileDraftMove } from "./draft-moves";

const unit = {
  originalGoalId: "22222222-2222-4222-8222-222222222222",
  unitKey: "total:1",
  scheduledDate: "2026-08-31",
  label: "Run",
  classification: "scheduled",
  creditState: "uncredited",
  draftMoveWindow: { start: "2026-08-01", end: "2026-09-30" },
};

describe("planMobileDraftMove", () => {
  it("allows cross-month moves without a month feature gate", () => {
    const result = planMobileDraftMove({
      state: createEmptyMobilePlannerDraft(),
      currentMonth: "2026-08",
      unit,
      nextDate: "2026-09-05",
    });

    expect(result.crossMonth).toBe(true);
    expect(result.targetMonth).toBe("2026-09");
    expect(result.state.commands[0]).toMatchObject({
      sourceDate: "2026-08-31",
      scheduledDate: "2026-09-05",
    });
  });

  it("rejects dates outside the session move window", () => {
    expect(() =>
      planMobileDraftMove({
        state: createEmptyMobilePlannerDraft(),
        currentMonth: "2026-08",
        unit,
        nextDate: "2026-10-01",
      })
    ).toThrow(
      new DraftMoveError(
        "That date is outside this session's allowed planner window (2026-08-01 to 2026-09-30)."
      )
    );
  });
});
