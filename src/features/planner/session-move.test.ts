import { describe, expect, it } from "vitest";
import {
  buildSessionMoveCommands,
  shouldKeepDraftCommandForPreview,
} from "@/features/planner/session-move";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";

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

describe("buildSessionMoveCommands", () => {
  it("emits a same-month dest claim only", () => {
    expect(
      buildSessionMoveCommands({
        goalId,
        unitKey: "unit-1",
        sourceMonth: "2026-08",
        destDate: "2026-08-12",
      })
    ).toEqual([
      {
        type: "upsert_move",
        scopeMonth: "2026-08",
        goalId,
        unitKey: "unit-1",
        scheduledDate: "2026-08-12",
      },
    ]);
  });

  it("clears the source month and claims the destination month", () => {
    expect(
      buildSessionMoveCommands({
        goalId,
        unitKey: "unit-1",
        sourceMonth: "2026-08",
        destDate: "2026-09-02",
      })
    ).toEqual([
      {
        type: "upsert_move",
        scopeMonth: "2026-08",
        goalId,
        unitKey: "unit-1",
        scheduledDate: null,
      },
      {
        type: "upsert_move",
        scopeMonth: "2026-09",
        goalId,
        unitKey: "unit-1",
        scheduledDate: "2026-09-02",
      },
    ]);
  });
});

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
});
