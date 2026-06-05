import { describe, expect, it } from "vitest";
import {
  isGoalCompleted,
  isGoalDoneForCurrentPeriod,
  isGoalManuallyArchived,
} from "@/lib/goals/schedule";
import type { Completion, Goal } from "@/lib/goals/types";

function buildGoal(overrides: Partial<Goal>): Goal {
  return {
    id: "goal-id",
    owner_id: "user-id",
    title: "Test goal",
    description: null,
    category: "general",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    milestone_names: null,
    start_date: "2026-01-01",
    end_date: null,
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function completion(date: string): Completion {
  return {
    id: `${date}-id`,
    goal_id: "goal-id",
    user_id: "user-id",
    completed_on: date,
    source: "manual",
    created_at: new Date().toISOString(),
  };
}

describe("goal schedule semantics", () => {
  it("treats weekly recurring as done when completion exists in anchored 7-day period", () => {
    const referenceDate = new Date("2026-05-11T12:00:00.000Z");
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      start_date: "2026-05-07",
    });

    expect(isGoalDoneForCurrentPeriod(goal, [completion("2026-05-09")], referenceDate)).toBe(true);
  });

  it("does not carry weekly completion across anchored period boundary", () => {
    const referenceDate = new Date("2026-05-14T12:00:00.000Z");
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      start_date: "2026-05-07",
    });

    expect(isGoalDoneForCurrentPeriod(goal, [completion("2026-05-09")], referenceDate)).toBe(false);
  });

  it("anchors monthly recurring periods to start day-of-month", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      start_date: "2026-01-31",
    });

    expect(
      isGoalDoneForCurrentPeriod(goal, [completion("2026-01-31")], new Date("2026-02-27T12:00:00.000Z"))
    ).toBe(true);
    expect(
      isGoalDoneForCurrentPeriod(goal, [completion("2026-01-31")], new Date("2026-02-28T12:00:00.000Z"))
    ).toBe(false);
  });

  it("treats fixed goals as done for current period only when completed today", () => {
    const goal = buildGoal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 8,
    });
    const referenceDate = new Date("2026-05-15T10:00:00.000Z");
    const completionToday = completion("2026-05-15");
    const completionYesterday = completion("2026-05-14");

    expect(isGoalDoneForCurrentPeriod(goal, [completionYesterday], referenceDate)).toBe(false);
    expect(isGoalDoneForCurrentPeriod(goal, [completionToday], referenceDate)).toBe(true);
  });

  it("auto-completes milestone goals once target count is reached", () => {
    const goal = buildGoal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 3,
      end_date: "2026-12-31",
    });

    expect(isGoalCompleted(goal, new Date("2026-05-10"), 2)).toBe(false);
    expect(isGoalCompleted(goal, new Date("2026-05-10"), 3)).toBe(true);
    expect(isGoalCompleted(goal, new Date("2026-05-10"), 4)).toBe(true);
  });

  it("does not auto-complete recurring goals when target is reached before end date", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: 3,
      end_date: "2026-12-31",
    });

    expect(isGoalCompleted(goal, new Date("2026-05-10"), 3)).toBe(false);
  });

  it("does not auto-complete indefinite recurring goals", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      end_date: null,
    });

    expect(isGoalCompleted(goal, new Date("2026-08-01"))).toBe(false);
  });

  it("completes any goal with an end date in the past", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      end_date: "2026-04-01",
    });

    expect(isGoalCompleted(goal, new Date("2026-05-01"))).toBe(true);
  });

  it("treats archived_at as manual archive only", () => {
    const goal = buildGoal({
      archived_at: "2026-05-01T00:00:00.000Z",
    });

    expect(isGoalManuallyArchived(goal)).toBe(true);
  });
});
