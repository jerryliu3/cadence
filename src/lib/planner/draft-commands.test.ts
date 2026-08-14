import { describe, expect, it } from "vitest";
import {
  projectPlannerDraftCommands,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";

const GOAL_A = "12000000-0000-4000-8000-000000000001";
const GOAL_B = "12000000-0000-4000-8000-000000000002";

describe("planner draft commands", () => {
  it("applies command projection in deterministic sequence order", () => {
    const commands: PlannerDraftCommand[] = [
      {
        id: "11000000-0000-4000-8000-000000000001",
        sequence: 3,
        kind: "rename_item",
        goalId: GOAL_A,
        unitKey: "total:1",
        label: "Tempo run",
      },
      {
        id: "11000000-0000-4000-8000-000000000002",
        sequence: 2,
        kind: "move_item",
        goalId: GOAL_A,
        unitKey: "total:1",
        scheduledDate: "2026-08-07",
        sourceDate: "2026-08-01",
      },
      {
        id: "11000000-0000-4000-8000-000000000003",
        sequence: 1,
        kind: "move_item",
        goalId: GOAL_A,
        unitKey: "total:1",
        scheduledDate: "2026-08-05",
        sourceDate: "2026-08-01",
      },
    ];

    const projection = projectPlannerDraftCommands(commands);
    expect(projection[`${GOAL_A}:total:1`]).toEqual({
      scheduledDate: "2026-08-07",
      label: "Tempo run",
    });
  });

  it("sorts tied commands by canonical tiebreakers", () => {
    const commands: PlannerDraftCommand[] = [
      {
        id: "22000000-0000-4000-8000-000000000003",
        sequence: 1,
        kind: "rename_item",
        goalId: GOAL_B,
        unitKey: "total:1",
        label: "B",
      },
      {
        id: "22000000-0000-4000-8000-000000000001",
        sequence: 1,
        kind: "move_item",
        goalId: GOAL_A,
        unitKey: "total:2",
        scheduledDate: "2026-08-03",
        sourceDate: "2026-08-01",
      },
      {
        id: "22000000-0000-4000-8000-000000000002",
        sequence: 1,
        kind: "move_item",
        goalId: GOAL_A,
        unitKey: "total:1",
        scheduledDate: "2026-08-02",
        sourceDate: "2026-08-01",
      },
    ];

    expect(
      sortPlannerDraftCommands(commands).map((command) => command.unitKey)
    ).toEqual(["total:1", "total:2", "total:1"]);
  });

  it("projects per-item time overrides", () => {
    const commands: PlannerDraftCommand[] = [
      {
        id: "23000000-0000-4000-8000-000000000002",
        sequence: 1,
        kind: "set_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:1",
        localTime: "19:45",
      },
      {
        id: "23000000-0000-4000-8000-000000000003",
        sequence: 2,
        kind: "clear_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:2",
      },
    ];

    const itemProjection = projectPlannerDraftCommands(commands);
    expect(itemProjection[`${GOAL_A}:total:1`]).toMatchObject({
      scheduledTimeOverride: "19:45",
    });
    expect(itemProjection[`${GOAL_A}:total:2`]).toMatchObject({
      scheduledTimeOverride: null,
    });
  });

  it("resolves same-sequence time toggles without UUID tiebreaks", () => {
    const commands: PlannerDraftCommand[] = [
      {
        id: "23000000-0000-4000-8000-000000000010",
        sequence: 7,
        kind: "clear_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:3",
      },
      {
        id: "23000000-0000-4000-8000-000000000001",
        sequence: 7,
        kind: "set_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:3",
        localTime: "21:15",
      },
    ];

    const sortedKinds = sortPlannerDraftCommands(commands).map(
      (command) => command.kind
    );
    expect(sortedKinds).toEqual([
      "set_item_time_override",
      "clear_item_time_override",
    ]);

    const itemProjection = projectPlannerDraftCommands(commands);
    expect(itemProjection[`${GOAL_A}:total:3`]).toMatchObject({
      scheduledTimeOverride: null,
    });
  });

  it("resolves same-sequence duplicate set overrides independent of UUID", () => {
    const key = `${GOAL_A}:total:9`;
    const commandsA: PlannerDraftCommand[] = [
      {
        id: "24000000-0000-4000-8000-000000000001",
        sequence: 11,
        kind: "set_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:9",
        localTime: "07:30",
      },
      {
        id: "24000000-0000-4000-8000-000000000010",
        sequence: 11,
        kind: "set_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:9",
        localTime: "20:45",
      },
    ];
    const commandsB: PlannerDraftCommand[] = [
      {
        id: "24000000-0000-4000-8000-000000000010",
        sequence: 11,
        kind: "set_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:9",
        localTime: "07:30",
      },
      {
        id: "24000000-0000-4000-8000-000000000001",
        sequence: 11,
        kind: "set_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:9",
        localTime: "20:45",
      },
    ];

    const projectedA = projectPlannerDraftCommands(commandsA)[key]
      ?.scheduledTimeOverride;
    const projectedB = projectPlannerDraftCommands(commandsB)[key]
      ?.scheduledTimeOverride;

    expect(projectedA).toBe(projectedB);
    expect(["07:30", "20:45"]).toContain(projectedA);
  });

});
