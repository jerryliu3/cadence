import { describe, expect, it } from "vitest";
import { buildPlannerDraftVisualDiff } from "@/lib/planner/diff";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";

const GOAL_ID = "11111111-1111-4111-8111-111111111111";

function moveCommand(
  sourceDate: string,
  scheduledDate: string | null
): PlannerDraftCommand {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    sequence: 1,
    kind: "move_item",
    itemId: "22222222-2222-4222-8222-111111111111",
    goalId: GOAL_ID,
    unitKey: "total:1",
    sourceDate,
    scheduledDate,
  };
}

describe("planner draft visual diff", () => {
  it("emits moved-from and moved-to entries from a move command", () => {
    const diff = buildPlannerDraftVisualDiff([
      moveCommand("2026-08-05", "2026-09-09"),
    ]);

    expect(diff).toEqual([
      {
        kind: "moved_from",
        goalId: GOAL_ID,
        unitKey: "total:1",
        date: "2026-08-05",
        counterpartDate: "2026-09-09",
      },
      {
        kind: "moved_to",
        goalId: GOAL_ID,
        unitKey: "total:1",
        date: "2026-09-09",
        counterpartDate: "2026-08-05",
      },
    ]);
  });

  it("emits only moved-from when a command unschedules an item", () => {
    const diff = buildPlannerDraftVisualDiff([
      moveCommand("2026-08-15", null),
    ]);

    expect(diff).toEqual([
      {
        kind: "moved_from",
        goalId: GOAL_ID,
        unitKey: "total:1",
        date: "2026-08-15",
        counterpartDate: null,
      },
    ]);
  });

  it("does not infer changes when a command keeps the same date", () => {
    expect(
      buildPlannerDraftVisualDiff([
        moveCommand("2026-08-15", "2026-08-15"),
      ])
    ).toEqual([]);
  });

  it("ignores non-placement draft commands", () => {
    expect(
      buildPlannerDraftVisualDiff([
        {
          id: "33333333-3333-4333-8333-333333333333",
          sequence: 1,
          kind: "rename_item",
          itemId: "33333333-3333-4333-8333-111111111111",
          goalId: GOAL_ID,
          unitKey: "total:1",
          label: "Renamed",
        },
      ])
    ).toEqual([]);
  });
});
