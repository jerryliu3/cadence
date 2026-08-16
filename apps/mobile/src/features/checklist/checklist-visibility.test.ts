import { describe, expect, it } from "vitest";
import type { MobileGoal } from "./checklist-lane-data";
import {
  countMobileChecklistGoalVisibility,
  filterMobileChecklistGoals,
} from "./checklist-visibility";

function goal(id: string, overrides: Partial<MobileGoal> = {}): MobileGoal {
  return {
    id,
    owner_id: "viewer-1",
    title: id,
    description: null,
    category: "health",
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    start_date: "2026-01-01",
    end_date: null,
    team_id: null,
    photo_path: null,
    archived_at: null,
    is_deleted: false,
    ...overrides,
  };
}

describe("mobile checklist visibility", () => {
  it("shows base goals plus the union of enabled status filters", () => {
    const goals = [
      goal("current"),
      goal("completed"),
      goal("past", { end_date: "2026-08-01" }),
      goal("upcoming", { start_date: "2026-09-01" }),
      goal("archived", { archived_at: "2026-08-01T00:00:00Z" }),
    ];
    const completedGoalIds = new Set(["completed"]);

    expect(
      filterMobileChecklistGoals({
        goals,
        completedGoalIds,
        asOfDate: "2026-08-15",
        filters: {
          showPastGoals: true,
          showUpcomingGoals: false,
          showArchivedGoals: true,
          showCompletedGoals: false,
        },
      }).map((item) => item.id)
    ).toEqual(["current", "past", "archived"]);

    expect(
      countMobileChecklistGoalVisibility({
        goals,
        completedGoalIds,
        asOfDate: "2026-08-15",
      })
    ).toEqual({ past: 1, upcoming: 1, archived: 1, completed: 1 });
  });
});
