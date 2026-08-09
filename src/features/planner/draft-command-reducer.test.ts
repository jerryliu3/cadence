import { describe, expect, it } from "vitest";
import {
  draftCommandReducer,
  initialDraftCommandState,
  selectDraftCommandsForScope,
} from "@/features/planner/draft-command-reducer";

describe("draftCommandReducer remove_entries", () => {
  it("removes all command kinds for targeted entries only", () => {
    let state = initialDraftCommandState;
    state = draftCommandReducer(state, {
      type: "upsert_move",
      scopeMonth: "2026-08",
      goalId: "goal-a",
      unitKey: "unit-1",
      scheduledDate: "2026-08-03",
    });
    state = draftCommandReducer(state, {
      type: "upsert_rename",
      scopeMonth: "2026-08",
      goalId: "goal-a",
      unitKey: "unit-1",
      label: "Renamed",
    });
    state = draftCommandReducer(state, {
      type: "upsert_time_override",
      scopeMonth: "2026-08",
      goalId: "goal-b",
      unitKey: "unit-2",
      localTime: "09:30",
    });

    const next = draftCommandReducer(state, {
      type: "remove_entries",
      scopeMonth: "2026-08",
      entries: [{ goalId: "goal-a", unitKey: "unit-1" }],
    });

    const commands = selectDraftCommandsForScope(next, "2026-08");
    expect(
      commands.some(
        (command) =>
          command.goalId === "goal-a" &&
          "unitKey" in command &&
          command.unitKey === "unit-1"
      )
    ).toBe(false);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      goalId: "goal-b",
      unitKey: "unit-2",
      kind: "set_item_time_override",
      localTime: "09:30",
    });
  });
});

describe("draftCommandReducer scope isolation", () => {
  it("keeps entries from other scopes when removing one scope", () => {
    let state = initialDraftCommandState;
    state = draftCommandReducer(state, {
      type: "upsert_move",
      scopeMonth: "2026-08",
      goalId: "goal-a",
      unitKey: "unit-1",
      scheduledDate: "2026-08-03",
    });
    state = draftCommandReducer(state, {
      type: "upsert_move",
      scopeMonth: "2026-09",
      goalId: "goal-a",
      unitKey: "unit-1",
      scheduledDate: "2026-09-02",
    });

    const next = draftCommandReducer(state, {
      type: "remove_scope",
      scopeMonth: "2026-08",
    });

    expect(selectDraftCommandsForScope(next, "2026-08")).toEqual([]);
    expect(selectDraftCommandsForScope(next, "2026-09")).toHaveLength(1);
  });
});
