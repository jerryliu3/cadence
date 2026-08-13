import { describe, expect, it } from "vitest";
import {
  getCompletionsForCurrentPeriod,
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
    team_id: null,
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
  it("treats weekly recurring as done when completion exists in the current profile week", () => {
    const referenceDate = new Date("2026-05-11T12:00:00.000Z");
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      start_date: "2026-05-07",
    });

    expect(isGoalDoneForCurrentPeriod(goal, [completion("2026-05-11")], referenceDate)).toBe(true);
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

  it("uses profile week-start windows for checklist and done-state checks", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      start_date: "2026-08-06",
    });
    const completions = [completion("2026-08-16"), completion("2026-08-18")];
    const referenceDate = new Date("2026-08-18T12:00:00.000Z");

    expect(
      getCompletionsForCurrentPeriod(goal, completions, referenceDate).map(
        (entry) => entry.completed_on
      )
    ).toEqual(["2026-08-18"]);
    expect(isGoalDoneForCurrentPeriod(goal, [completion("2026-08-16")], referenceDate)).toBe(false);

    const weeklyAnchor = {
      weekStartsOn: 4,
    };
    expect(
      getCompletionsForCurrentPeriod(goal, completions, referenceDate, {
        weeklyAnchor,
      }).map((entry) => entry.completed_on)
    ).toEqual(["2026-08-16", "2026-08-18"]);
    expect(
      isGoalDoneForCurrentPeriod(goal, [completion("2026-08-16")], referenceDate, {
        weeklyAnchor,
      })
    ).toBe(true);
    expect(
      isGoalDoneForCurrentPeriod(goal, [completion("2026-08-18")], referenceDate, {
        weeklyAnchor,
      })
    ).toBe(true);
  });

  it("anchors monthly recurring periods to calendar month boundaries", () => {
    const goal = buildGoal({
      frequency_type: "recurring",
      recurrence_interval: "monthly",
      start_date: "2026-01-31",
    });

    expect(
      isGoalDoneForCurrentPeriod(goal, [completion("2026-01-31")], new Date("2026-02-27T12:00:00.000Z"))
    ).toBe(false);
    expect(
      isGoalDoneForCurrentPeriod(goal, [completion("2026-02-05")], new Date("2026-02-28T12:00:00.000Z"))
    ).toBe(true);
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

  it("treats archived_at as manual archive only", () => {
    const goal = buildGoal({
      archived_at: "2026-05-01T00:00:00.000Z",
    });

    expect(isGoalManuallyArchived(goal)).toBe(true);
  });
});
