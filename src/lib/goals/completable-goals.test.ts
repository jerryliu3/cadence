import { describe, expect, it } from "vitest";
import {
  buildCompletableGoalIds,
  filterCompletionsForGoalIds,
  selectCompletableGoals,
} from "./completable-goals";

const goals = [
  { id: "goal-owned", owner_id: "user-1" },
  { id: "goal-visible", owner_id: "user-2" },
];

const participants = [
  { goal_id: "goal-visible" },
  { goal_id: "goal-hidden" },
];

describe("buildCompletableGoalIds", () => {
  it("includes owned goals and participant goals by default", () => {
    const ids = buildCompletableGoalIds({
      goals,
      participants,
      userId: "user-1",
    });

    expect(Array.from(ids).sort()).toEqual([
      "goal-hidden",
      "goal-owned",
      "goal-visible",
    ]);
  });

  it("can restrict participant goals to the visible goals list", () => {
    const ids = buildCompletableGoalIds({
      goals,
      participants,
      userId: "user-1",
      restrictParticipantsToVisibleGoals: true,
    });

    expect(Array.from(ids).sort()).toEqual(["goal-owned", "goal-visible"]);
  });
});

describe("goal scope selectors", () => {
  it("selects only goals present in the completable scope", () => {
    const selected = selectCompletableGoals(goals, new Set(["goal-visible"]));
    expect(selected.map((goal) => goal.id)).toEqual(["goal-visible"]);
  });

  it("filters completions by completable goal id scope", () => {
    const scoped = filterCompletionsForGoalIds(
      [
        { goal_id: "goal-owned", completed_on: "2026-08-10" },
        { goal_id: "goal-hidden", completed_on: "2026-08-11" },
      ],
      new Set(["goal-owned"])
    );

    expect(scoped).toEqual([
      { goal_id: "goal-owned", completed_on: "2026-08-10" },
    ]);
  });
});
