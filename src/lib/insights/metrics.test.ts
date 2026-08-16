import { describe, expect, it } from "vitest";
import type { GoalProgressSnapshot } from "@/lib/goals/progress";
import type { Completion, Goal } from "@/lib/goals/types";
import { buildInsightsStatsGroup } from "@/lib/insights/metrics";

function makeGoal(
  overrides: Partial<Goal> & Pick<Goal, "id" | "owner_id" | "title">
): Goal {
  const { id, owner_id, title, ...rest } = overrides;
  return {
    id,
    owner_id,
    title,
    description: null,
    category: "Health",
    category_key: "health",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    milestone_names: null,
    start_date: "2026-01-01",
    end_date: null,
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

function makeCompletion(
  overrides: Partial<Completion> & Pick<Completion, "id" | "goal_id" | "user_id" | "completed_on">
): Completion {
  const { id, goal_id, user_id, completed_on, ...rest } = overrides;
  return {
    id,
    goal_id,
    user_id,
    completed_on,
    source: "manual",
    created_at: `${completed_on}T10:00:00Z`,
    ...rest,
  };
}

function makeSummary(goalId: string, outcome: GoalProgressSnapshot["outcome"]): GoalProgressSnapshot {
  return {
    goalId,
    admissibleCompletionCount: 0,
    creditedUnitCount: 0,
    expectedUnitCount: 0,
    percent: 0,
    lifecycle: "active",
    outcome,
    placementTerminal: outcome === "achieved",
    currentStreak: 0,
    longestStreak: 0,
    milestoneDates: [],
  };
}

describe("buildInsightsStatsGroup", () => {
  it("computes activity totals, trends, and active streak", () => {
    const goals = [makeGoal({ id: "g1", owner_id: "u1", title: "Run" })];
    const completions = [
      makeCompletion({ id: "c1", goal_id: "g1", user_id: "u1", completed_on: "2026-01-07" }),
      makeCompletion({ id: "c2", goal_id: "g1", user_id: "u1", completed_on: "2026-01-08" }),
      makeCompletion({ id: "c3", goal_id: "g1", user_id: "u1", completed_on: "2026-01-09" }),
      makeCompletion({ id: "c4", goal_id: "g1", user_id: "u1", completed_on: "2026-01-10" }),
      makeCompletion({ id: "c5", goal_id: "g1", user_id: "u1", completed_on: "2026-01-10" }),
    ];

    const stats = buildInsightsStatsGroup({
      goals,
      completions,
      summariesByGoal: new Map([["g1", makeSummary("g1", "achieved")]]),
      asOfDate: "2026-01-10",
      weekStartsOn: 0,
      accountCreatedDate: "2026-01-01",
    });

    expect(stats.totalActivities).toBe(5);
    expect(stats.totalGoalsCompleted).toBe(1);
    expect(stats.todayActivities).toBe(2);
    expect(stats.activeStreakDays).toBe(4);
    expect(stats.currentWeekActivities.current).toBe(5);
    expect(stats.currentWeekActivities.previous).toBe(0);
    expect(stats.rolling30DaysActivities.current).toBe(5);
  });

  it("uses completion-gated denominator for weekly and milestone goals", () => {
    const goals = [
      makeGoal({ id: "daily", owner_id: "u1", title: "Daily", recurrence_interval: "daily" }),
      makeGoal({ id: "weekly", owner_id: "u1", title: "Weekly", recurrence_interval: "weekly" }),
      makeGoal({
        id: "milestone",
        owner_id: "u1",
        title: "Milestone",
        frequency_type: "fixed_milestones",
        recurrence_interval: null,
        target_count: 1,
      }),
    ];
    const completions = [
      makeCompletion({ id: "c1", goal_id: "daily", user_id: "u1", completed_on: "2026-01-10" }),
    ];

    const stats = buildInsightsStatsGroup({
      goals,
      completions,
      summariesByGoal: new Map([
        ["daily", makeSummary("daily", "in_progress")],
        ["weekly", makeSummary("weekly", "in_progress")],
        ["milestone", makeSummary("milestone", "in_progress")],
      ]),
      asOfDate: "2026-01-10",
      weekStartsOn: 0,
      accountCreatedDate: "2026-01-01",
    });

    const targetDay = stats.completionRateByDay.find((point) => point.date === "2026-01-10");
    expect(targetDay).toBeTruthy();
    expect(targetDay?.numerator).toBe(1);
    expect(targetDay?.denominator).toBe(1);
    expect(Math.round(targetDay?.percent ?? 0)).toBe(100);
  });

  it("builds category and weekday breakdowns", () => {
    const goals = [
      makeGoal({
        id: "health-goal",
        owner_id: "u1",
        title: "Run",
        category: "Health",
        category_key: "health",
      }),
      makeGoal({
        id: "career-goal",
        owner_id: "u1",
        title: "Ship",
        category: "Career",
        category_key: "career",
      }),
    ];
    const completions = [
      makeCompletion({
        id: "c1",
        goal_id: "health-goal",
        user_id: "u1",
        completed_on: "2026-01-09",
      }),
      makeCompletion({
        id: "c2",
        goal_id: "career-goal",
        user_id: "u1",
        completed_on: "2026-01-10",
      }),
    ];

    const stats = buildInsightsStatsGroup({
      goals,
      completions,
      summariesByGoal: new Map([
        ["health-goal", makeSummary("health-goal", "in_progress")],
        ["career-goal", makeSummary("career-goal", "in_progress")],
      ]),
      asOfDate: "2026-01-10",
      weekStartsOn: 0,
      accountCreatedDate: "2026-01-01",
    });

    expect(stats.completionRateByCategory.length).toBeGreaterThanOrEqual(2);
    const health = stats.completionRateByCategory.find((point) => point.categoryKey === "health");
    expect(health?.numerator).toBeGreaterThan(0);
    const saturday = stats.completionByWeekday.find((point) => point.weekdayLabel === "Sat");
    expect(saturday?.numerator).toBeGreaterThan(0);
  });
});
