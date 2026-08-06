import { describe, expect, it } from "vitest";
import {
  buildPlannerDraftCommandsFromLegacyItemEdits,
  projectPlannerGoalDefaultTimes,
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
      },
      {
        id: "11000000-0000-4000-8000-000000000003",
        sequence: 1,
        kind: "move_item",
        goalId: GOAL_A,
        unitKey: "total:1",
        scheduledDate: "2026-08-05",
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
        id: "22000000-0000-4000-8000-000000000004",
        sequence: 1,
        kind: "set_goal_default_time",
        goalId: GOAL_A,
        localTime: "07:30",
      },
      {
        id: "22000000-0000-4000-8000-000000000001",
        sequence: 1,
        kind: "move_item",
        goalId: GOAL_A,
        unitKey: "total:2",
        scheduledDate: "2026-08-03",
      },
      {
        id: "22000000-0000-4000-8000-000000000002",
        sequence: 1,
        kind: "move_item",
        goalId: GOAL_A,
        unitKey: "total:1",
        scheduledDate: "2026-08-02",
      },
    ];

    expect(
      sortPlannerDraftCommands(commands).map((command) =>
        "unitKey" in command ? command.unitKey : "(goal-default)"
      )
    ).toEqual(["total:1", "total:2", "(goal-default)", "total:1"]);
  });

  it("projects goal defaults and per-item time overrides", () => {
    const commands: PlannerDraftCommand[] = [
      {
        id: "23000000-0000-4000-8000-000000000001",
        sequence: 1,
        kind: "set_goal_default_time",
        goalId: GOAL_A,
        localTime: "08:00",
      },
      {
        id: "23000000-0000-4000-8000-000000000002",
        sequence: 2,
        kind: "set_item_time_override",
        goalId: GOAL_A,
        unitKey: "total:1",
        localTime: "19:45",
      },
      {
        id: "23000000-0000-4000-8000-000000000003",
        sequence: 3,
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

    const goalDefaults = projectPlannerGoalDefaultTimes(commands);
    expect(goalDefaults[GOAL_A]).toBe("08:00");
  });

  it("converts legacy draft edits into typed draft commands", () => {
    const commands = buildPlannerDraftCommandsFromLegacyItemEdits([
      {
        goalId: GOAL_B,
        unitKey: "total:2",
        scheduledDate: null,
        label: "Long run",
      },
      {
        goalId: GOAL_A,
        unitKey: "total:1",
        scheduledDate: "2026-08-06",
        label: null,
      },
    ]);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      sequence: 1,
      kind: "move_item",
      goalId: GOAL_A,
      unitKey: "total:1",
      scheduledDate: "2026-08-06",
    });
    expect(commands[1]).toMatchObject({
      sequence: 2,
      kind: "rename_item",
      goalId: GOAL_B,
      unitKey: "total:2",
      label: "Long run",
    });
  });
});
