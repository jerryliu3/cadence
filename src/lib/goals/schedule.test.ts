import { addDays, startOfISOWeek } from "date-fns";
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
  it("treats weekly recurring as done when any completion exists in ISO week", () => {
    const referenceDate = new Date("2026-05-28T12:00:00.000Z");
    const weekStart = startOfISOWeek(referenceDate);
    const dateInWeek = addDays(weekStart, 2).toISOString().slice(0, 10);
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "weekly",
    });

    expect(isGoalDoneForCurrentPeriod(goal, [completion(dateInWeek)], referenceDate)).toBe(true);
  });

  it("treats fixed milestones as done for current period only when completed today", () => {
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

  it("marks milestone goals as completed once target is reached", () => {
    const goal = buildGoal({
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 1,
    });

    expect(isGoalCompleted(goal, 0)).toBe(false);
    expect(isGoalCompleted(goal, 1)).toBe(true);
  });

  it("does not auto-complete indefinite recurring goals", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      end_date: null,
    });

    expect(isGoalCompleted(goal, 500, new Date("2026-08-01"))).toBe(false);
  });

  it("completes any goal with an end date in the past", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "daily",
      end_date: "2026-04-01",
    });

    expect(isGoalCompleted(goal, 0, new Date("2026-05-01"))).toBe(true);
  });

  it("treats archived_at as manual archive only", () => {
    const goal = buildGoal({
      archived_at: "2026-05-01T00:00:00.000Z",
    });

    expect(isGoalManuallyArchived(goal)).toBe(true);
  });
});
