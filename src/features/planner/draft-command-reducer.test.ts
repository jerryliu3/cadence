import { describe, expect, it } from "vitest";
import {
  draftCommandReducer,
  initialDraftCommandState,
  selectDraftCommandsForScope,
  shouldKeepDraftCommandForPreview,
} from "@/features/planner/draft-command-reducer";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";

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

const goalId = "11111111-1111-4111-8111-111111111111";

function moveCommand(
  scheduledDate: string | null,
  id = "22222222-2222-4222-8222-222222222222"
): PlannerDraftCommand {
  return {
    id,
    sequence: 1,
    goalId,
    unitKey: "unit-1",
    kind: "move_item",
    scheduledDate,
  };
}

describe("shouldKeepDraftCommandForPreview", () => {
  it("keeps commands whose entries are still in the month preview", () => {
    const command = moveCommand("2026-08-12");
    expect(
      shouldKeepDraftCommandForPreview({
        command,
        scopeMonth: "2026-08",
        previewEntryKeys: new Set([`${goalId}:unit-1`]),
        commandsByScope: {},
      })
    ).toBe(true);
  });

  it("drops stale same-month moves that left the preview", () => {
    const command = moveCommand("2026-08-12");
    expect(
      shouldKeepDraftCommandForPreview({
        command,
        scopeMonth: "2026-08",
        previewEntryKeys: new Set(),
        commandsByScope: { "2026-08": [command] },
      })
    ).toBe(false);
  });

  it("keeps a source-clear when the dest month has a paired claim", () => {
    const sourceClear = moveCommand(null);
    const destClaim = moveCommand("2026-09-02", "33333333-3333-4333-8333-333333333333");
    expect(
      shouldKeepDraftCommandForPreview({
        command: sourceClear,
        scopeMonth: "2026-08",
        previewEntryKeys: new Set(),
        commandsByScope: {
          "2026-08": [sourceClear],
          "2026-09": [destClaim],
        },
      })
    ).toBe(true);
  });

  it("keeps an unpaired source-clear after an A→B→A round trip leaves a null move on a month that never held the entry", () => {
    const leftoverClear = moveCommand(null);
    const returnClaim = moveCommand("2026-08-12", "44444444-4444-4444-8444-444444444444");
    expect(
      shouldKeepDraftCommandForPreview({
        command: leftoverClear,
        scopeMonth: "2026-09",
        previewEntryKeys: new Set(),
        commandsByScope: {
          "2026-09": [leftoverClear],
          "2026-08": [returnClaim],
        },
      })
    ).toBe(true);
  });
});
