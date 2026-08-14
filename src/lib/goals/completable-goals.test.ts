import { describe, expect, it } from "vitest";
import {
  buildCompletableGoalIds,
  filterCompletionsForGoalIds,
  selectCompletableGoals,
} from "@cadence/shared/goals/completable-goals";

const goals = [
  { id: "goal-owned", owner_id: "user-1", team_id: null },
  { id: "goal-team", owner_id: "user-2", team_id: "team-1" },
  { id: "goal-other", owner_id: "user-2", team_id: "team-2" },
];

describe("buildCompletableGoalIds", () => {
  it("includes owned goals and goals for teams the user belongs to", () => {
    const ids = buildCompletableGoalIds({
      goals,
      userId: "user-1",
      memberTeamIds: ["team-1"],
    });

    expect(Array.from(ids).sort()).toEqual(["goal-owned", "goal-team"]);
  });

  it("does not treat another team's goals as completable", () => {
    const ids = buildCompletableGoalIds({
      goals,
      userId: "user-1",
      memberTeamIds: ["team-1"],
    });

    expect(ids.has("goal-other")).toBe(false);
  });
});

describe("goal scope selectors", () => {
  it("selects only goals present in the completable scope", () => {
    const selected = selectCompletableGoals(goals, new Set(["goal-team"]));
    expect(selected.map((goal) => goal.id)).toEqual(["goal-team"]);
  });

  it("filters completions by completable goal id scope", () => {
    const scoped = filterCompletionsForGoalIds(
      [
        { goal_id: "goal-owned", completed_on: "2026-08-10" },
        { goal_id: "goal-other", completed_on: "2026-08-11" },
      ],
      new Set(["goal-owned"])
    );

    expect(scoped).toEqual([
      { goal_id: "goal-owned", completed_on: "2026-08-10" },
    ]);
  });
});
