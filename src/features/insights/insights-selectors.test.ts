import { describe, expect, it } from "vitest";
import {
  selectOverallCompletionPercent,
  selectSearchedGoals,
  selectVisiblePerGoalHeatmaps,
} from "@/features/insights/insights-selectors";
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

describe("insights selectors", () => {
  it("filters goals by title search and overall completion average", () => {
    const goals = [
      goal({ id: "a", owner_id: "me", title: "Run" }),
      goal({ id: "b", owner_id: "me", title: "Read" }),
    ];
    expect(selectSearchedGoals(goals, " re ").map((row) => row.id)).toEqual(["b"]);
    expect(
      selectOverallCompletionPercent(goals, new Map([["a", { percent: 50 }], ["b", { percent: 100 }]]))
    ).toBe(75);
    expect(selectOverallCompletionPercent([], new Map())).toBe(0);
  });

  it("splits current and historical heatmaps from the visible period", () => {
    const goals = [
      goal({
        id: "current",
        owner_id: "me",
        title: "Current",
        start_date: "2026-08-01",
        end_date: "2026-12-31",
      }),
      goal({
        id: "historical",
        owner_id: "me",
        title: "Historical",
        start_date: "2026-01-01",
        end_date: "2026-03-01",
      }),
    ];
    const hiddenHistorical = selectVisiblePerGoalHeatmaps({
      goals,
      visiblePeriodStart: "2026-08-01",
      endMonth: null,
      showHistoricalGoals: false,
      sort: "earliest_end",
    });
    expect(hiddenHistorical.visiblePerGoalHeatmaps.map((row) => row.id)).toEqual(["current"]);
    const shownHistorical = selectVisiblePerGoalHeatmaps({
      goals,
      visiblePeriodStart: "2026-08-01",
      endMonth: null,
      showHistoricalGoals: true,
      sort: "earliest_end",
    });
    expect(shownHistorical.visiblePerGoalHeatmaps.map((row) => row.id)).toEqual([
      "current",
      "historical",
    ]);
  });
});
