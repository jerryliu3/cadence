import { describe, expect, it } from "vitest";
import {
  getRecurrenceGroup,
  groupGoalsByRecurrence,
  selectFilteredTodayGoals,
} from "@/features/today/checklist-selectors";
import type { Goal } from "@/lib/goals/types";

function goal(overrides: Partial<Goal> & Pick<Goal, "id" | "owner_id" | "title">): Goal {
  return {
    description: null,
    category: "health",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    milestone_names: null,
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("checklist selectors", () => {
  it("groups recurrence and filters today's matching goals", () => {
    const goals = [
      goal({ id: "daily", owner_id: "me", title: "Run", start_date: "2026-08-01" }),
      goal({
        id: "weekly",
        owner_id: "me",
        title: "Long run",
        recurrence_interval: "weekly",
        start_date: "2026-08-01",
      }),
      goal({
        id: "future",
        owner_id: "me",
        title: "Later",
        start_date: "2026-09-01",
      }),
    ];
    expect(getRecurrenceGroup(goals[1])).toBe("weekly");
    expect(
      groupGoalsByRecurrence(goals, "earliest_end").map((group) => group.key)
    ).toEqual(["daily", "weekly"]);
    expect(
      selectFilteredTodayGoals({
        activeGoals: goals,
        todayDate: "2026-08-13",
        categoryFilters: [],
        recurrenceFilters: [],
        searchQuery: "run",
        endMonths: [],
      }).map((row) => row.id)
    ).toEqual(["daily", "weekly"]);

    expect(
      selectFilteredTodayGoals({
        activeGoals: goals,
        todayDate: "2026-08-13",
        categoryFilters: [],
        recurrenceFilters: [],
        searchQuery: "run",
        endMonths: [],
        completedGoalIds: new Set(["daily"]),
        showCompletedGoals: false,
      }).map((row) => row.id)
    ).toEqual(["weekly"]);
  });

  it("applies OR filtering for categories, cadence, and end months", () => {
    const goals = [
      goal({
        id: "health-daily",
        owner_id: "me",
        title: "Health daily",
        category: "health",
        category_key: "health",
        recurrence_interval: "daily",
        end_date: "2026-08-30",
      }),
      goal({
        id: "career-weekly",
        owner_id: "me",
        title: "Career weekly",
        category: "career",
        category_key: "career",
        recurrence_interval: "weekly",
        end_date: "2026-09-30",
      }),
      goal({
        id: "personal-monthly",
        owner_id: "me",
        title: "Personal monthly",
        category: "personal",
        category_key: "personal",
        recurrence_interval: "monthly",
        end_date: "2026-10-31",
      }),
    ];

    expect(
      selectFilteredTodayGoals({
        activeGoals: goals,
        todayDate: "2026-08-13",
        categoryFilters: ["health", "career"],
        recurrenceFilters: ["daily", "weekly"],
        searchQuery: "",
        endMonths: ["2026-08", "2026-09"],
      }).map((row) => row.id)
    ).toEqual(["health-daily", "career-weekly"]);
  });
});
