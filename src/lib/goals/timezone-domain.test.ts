import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import {
  getGoalProgressSnapshot,
  getRecurringStreaksAtDate,
} from "./progress";

const monthlyGoal: Goal = {
  id: "monthly-goal",
  owner_id: "owner-id",
  title: "Monthly goal",
  description: null,
  category: "Personal",
  color: null,
  frequency_type: "recurring",
  recurrence_interval: "monthly",
  target_count: null,
  milestone_names: null,
  start_date: "2026-01-31",
  end_date: null,
  photo_path: null,
  is_group: false,
  is_deleted: false,
  archived_at: null,
  created_at: "2026-01-31T00:00:00Z",
  updated_at: "2026-01-31T00:00:00Z",
};

function completion(date: string): Completion {
  return {
    id: `${date}-id`,
    goal_id: monthlyGoal.id,
    user_id: monthlyGoal.owner_id,
    completed_on: date,
    source: "manual",
    created_at: `${date}T12:00:00Z`,
  };
}

describe("string-based progress under the process timezone matrix", () => {
  const completions = [
    completion("2026-01-31"),
    completion("2026-02-28"),
    completion("2026-03-31"),
  ];

  it("keeps monthly progress invariant across calendar-month periods", () => {
    expect(
      getGoalProgressSnapshot(monthlyGoal, completions.slice(0, 2), "2026-02-28")
    ).toMatchObject({
      creditedUnitCount: 2,
      expectedUnitCount: 2,
      percent: 100,
    });
  });

  it("uses period indices for streak adjacency", () => {
    expect(
      getRecurringStreaksAtDate(monthlyGoal, completions, "2026-03-31")
    ).toEqual({
      current: 3,
      longest: 3,
    });
  });
});
