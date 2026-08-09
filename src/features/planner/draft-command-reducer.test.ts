import { describe, expect, it } from "vitest";
import {
  draftCommandReducer,
  initialDraftCommandState,
} from "@/features/planner/draft-command-reducer";

describe("draftCommandReducer remove_entries", () => {
  it("removes all command kinds for targeted entries only", () => {
    let state = initialDraftCommandState;
    state = draftCommandReducer(state, {
      type: "upsert_move",
      goalId: "goal-a",
      unitKey: "unit-1",
      scheduledDate: "2026-08-03",
    });
    state = draftCommandReducer(state, {
      type: "upsert_rename",
      goalId: "goal-a",
      unitKey: "unit-1",
      label: "Renamed",
    });
    state = draftCommandReducer(state, {
      type: "upsert_time_override",
      goalId: "goal-b",
      unitKey: "unit-2",
      localTime: "09:30",
    });

    const next = draftCommandReducer(state, {
      type: "remove_entries",
      entries: [{ goalId: "goal-a", unitKey: "unit-1" }],
    });

    expect(
      next.commands.some(
        (command) =>
          command.goalId === "goal-a" &&
          "unitKey" in command &&
          command.unitKey === "unit-1"
      )
    ).toBe(false);
    expect(next.commands).toHaveLength(1);
    expect(next.commands[0]).toMatchObject({
      goalId: "goal-b",
      unitKey: "unit-2",
      kind: "set_item_time_override",
      localTime: "09:30",
    });
  });
});
