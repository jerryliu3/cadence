import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import { getGoalLifecycleOutcome } from "./lifecycle";

function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-id",
    owner_id: "owner-id",
    title: "Goal",
    description: null,
    category: "Personal",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: 3,
    milestone_names: null,
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function completion(date: string, index = 0): Completion {
  return {
    id: `${date}-${index}`,
    goal_id: "goal-id",
    user_id: "owner-id",
    completed_on: date,
    source: "manual",
    created_at: `${date}T12:00:00Z`,
  };
}

describe("goal lifecycle and outcome", () => {
  it("keeps deadline day active and separates early achievement", () => {
    const goal = buildGoal();
    const completions = [
      completion("2026-08-01"),
      completion("2026-08-02"),
      completion("2026-08-03"),
    ];

    expect(
      getGoalLifecycleOutcome(goal, completions, {
        asOfDate: "2026-08-15",
      })
    ).toMatchObject({
      lifecycle: "active",
      outcome: "achieved",
      placementTerminal: true,
    });
    expect(
      getGoalLifecycleOutcome(goal, completions, {
        asOfDate: "2026-08-31",
      }).lifecycle
    ).toBe("active");
  });

  it("does not let late completion facts repair a deadline shortfall", () => {
    const goal = buildGoal();
    const completions = [
      completion("2026-08-01"),
      completion("2026-09-01"),
      completion("2026-09-02"),
    ];

    expect(
      getGoalLifecycleOutcome(goal, completions, {
        asOfDate: "2026-09-05",
      })
    ).toMatchObject({
      lifecycle: "ended",
      outcome: "ended_with_shortfall",
    });
  });

  it("requires every clipped cadence period for an ended achievement", () => {
    const goal = buildGoal({
      target_count: null,
      recurrence_interval: "weekly",
    });
    const completeCadence = [
      completion("2026-08-01"),
      completion("2026-08-08"),
      completion("2026-08-15"),
      completion("2026-08-22"),
      completion("2026-08-29"),
      completion("2026-08-31"),
    ];

    expect(
      getGoalLifecycleOutcome(goal, completeCadence, {
        asOfDate: "2026-09-01",
      }).outcome
    ).toBe("achieved");
    expect(
      getGoalLifecycleOutcome(goal, completeCadence.slice(0, -1), {
        asOfDate: "2026-09-01",
      }).outcome
    ).toBe("ended_with_shortfall");
  });

  it("archives lifecycle without inventing a terminal outcome", () => {
    const goal = buildGoal({
      archived_at: "2026-08-15T12:00:00Z",
    });

    expect(
      getGoalLifecycleOutcome(goal, [completion("2026-08-01")], {
        asOfDate: "2026-09-15",
      })
    ).toMatchObject({
      lifecycle: "archived",
      outcome: "in_progress",
      placementTerminal: true,
    });
  });
});
