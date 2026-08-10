import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import {
  filterGoalsByLinkSearch,
  filterLinkableGoals,
} from "./linkable-goals";

function buildGoal(
  id: string,
  options: Partial<Goal> = {}
): Goal {
  return {
    id,
    owner_id: "user-1",
    title: id,
    description: null,
    category: "general",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    milestone_names: null,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...options,
  };
}

describe("filterLinkableGoals", () => {
  it("keeps active non-group goals and can exclude one id", () => {
    const goals = [
      buildGoal("goal-active"),
      buildGoal("goal-ended"),
      buildGoal("goal-group", { is_group: true }),
    ];

    const filtered = filterLinkableGoals(
      goals,
      new Map([
        ["goal-active", { lifecycle: "active" }],
        ["goal-ended", { lifecycle: "ended" }],
        ["goal-group", { lifecycle: "active" }],
      ]),
      { excludeGoalId: "goal-active" }
    );

    expect(filtered.map((goal) => goal.id)).toEqual([]);
  });
});

describe("filterGoalsByLinkSearch", () => {
  it("matches by title and linked-goal metadata labels", () => {
    const goals = [
      buildGoal("read-books", {
        title: "Read books",
        recurrence_interval: "weekly",
      }),
      buildGoal("run", {
        title: "Morning run",
        recurrence_interval: "daily",
      }),
    ];

    expect(filterGoalsByLinkSearch(goals, "read").map((goal) => goal.id)).toEqual([
      "read-books",
    ]);
    expect(filterGoalsByLinkSearch(goals, "weekly").map((goal) => goal.id)).toEqual([
      "read-books",
    ]);
  });
});
