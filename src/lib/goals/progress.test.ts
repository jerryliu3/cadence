import { describe, expect, it } from "vitest";
import {
  getGoalCompletionPercentage,
  getOverallCompletionPercentage,
  getRecurringStreaks,
  getRecurringStreaksAtDate,
} from "@/lib/goals/progress";
import type { Completion, Goal } from "@/lib/goals/types";

function buildGoal(overrides: Partial<Goal>): Goal {
  return {
    id: "goal-id",
    owner_id: "user-id",
    title: "Goal",
    description: null,
    category: "general",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    milestone_names: null,
    start_date: "2026-05-01",
    end_date: null,
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function completion(goalId: string, date: string): Completion {
  return {
    id: `${goalId}-${date}`,
    goal_id: goalId,
    user_id: "user-id",
    completed_on: date,
    source: "manual",
    created_at: new Date().toISOString(),
  };
}

describe("goal progress calculations", () => {
  it("calculates fixed completion percentage", () => {
    const goal = buildGoal({
      id: "fixed-id",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 10,
    });
    const completions = [
      completion("fixed-id", "2026-05-01"),
      completion("fixed-id", "2026-05-02"),
      completion("fixed-id", "2026-05-03"),
    ];

    expect(getGoalCompletionPercentage(goal, completions)).toBe(30);
  });

  it("calculates recurring adherence as completed periods / expected periods", () => {
    const goal = buildGoal({
      id: "daily-id",
      frequency_type: "recurring",
      recurrence_interval: "daily",
      start_date: "2026-05-01",
    });
    const completions = [
      completion("daily-id", "2026-05-01"),
      completion("daily-id", "2026-05-03"),
      completion("daily-id", "2026-05-05"),
    ];

    const percent = getGoalCompletionPercentage(goal, completions, new Date(2026, 4, 5));
    expect(percent).toBe(60);
  });

  it("uses target count when recurring goal defines one", () => {
    const goal = buildGoal({
      id: "targeted-recurring-id",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 5,
    });
    const completions = [
      completion("targeted-recurring-id", "2026-05-01"),
      completion("targeted-recurring-id", "2026-05-03"),
    ];

    expect(getGoalCompletionPercentage(goal, completions)).toBe(40);
  });

  it("anchors monthly expected periods to calendar-month boundaries", () => {
    const goal = buildGoal({
      id: "monthly-anchored-id",
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      start_date: "2026-01-31",
    });
    const completions = [
      completion("monthly-anchored-id", "2026-01-31"),
      completion("monthly-anchored-id", "2026-02-28"),
    ];

    const percent = getGoalCompletionPercentage(goal, completions, new Date("2026-03-30T12:00:00.000Z"));
    expect(percent).toBeCloseTo(66.6667, 3);
  });

  it("computes overall completion as average across goals", () => {
    const goalA = buildGoal({
      id: "goal-a",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 1,
    });
    const goalB = buildGoal({
      id: "goal-b",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 4,
    });

    const map = new Map<string, Completion[]>();
    map.set("goal-a", [completion("goal-a", "2026-05-01")]);
    map.set("goal-b", [
      completion("goal-b", "2026-05-01"),
      completion("goal-b", "2026-05-02"),
    ]);

    expect(getOverallCompletionPercentage([goalA, goalB], map)).toBe(75);
  });

  it("returns current and longest streak for recurring goals", () => {
    const goal = buildGoal({
      id: "streak-id",
      frequency_type: "recurring",
      recurrence_interval: "daily",
      start_date: "2026-05-01",
    });
    const completions = [
      completion("streak-id", "2026-05-01"),
      completion("streak-id", "2026-05-02"),
      completion("streak-id", "2026-05-03"),
      completion("streak-id", "2026-05-05"),
    ];

    const streaks = getRecurringStreaks(goal, completions, new Date(2026, 4, 5));
    expect(streaks.longest).toBe(3);
    expect(streaks.current).toBe(1);
  });

  it("re-buckets weekly streaks by profile week-start period identity", () => {
    const goal = buildGoal({
      id: "weekly-streak-cutover",
      recurrence_interval: "weekly",
      start_date: "2026-08-06",
    });
    const completions = [
      completion("weekly-streak-cutover", "2026-08-16"),
      completion("weekly-streak-cutover", "2026-08-18"),
    ];

    expect(getRecurringStreaksAtDate(goal, completions, "2026-08-18")).toEqual({
      current: 2,
      longest: 2,
    });
    expect(
      getRecurringStreaksAtDate(goal, completions, "2026-08-18", {
        weeklyAnchor: {
          weekStartsOn: 4,
        },
      })
    ).toEqual({
      current: 1,
      longest: 1,
    });
  });
});
