import { describe, expect, it } from "vitest";
import { allCategoriesValue } from "@/features/goals/goal-filters";
import {
  buildCalendarCategoryFilterOptions,
  goalPassesCalendarFilters,
} from "@/features/planner/calendar-filters";

describe("calendar filters", () => {
  it("builds sorted category options and trims category labels", () => {
    const options = buildCalendarCategoryFilterOptions(
      new Map([
        ["goal-a", { category: "  Personal  ", end_date: "2026-08-31" }],
        ["goal-b", { category: "Health", end_date: "2026-09-30" }],
        ["goal-c", { category: "Personal", end_date: null }],
      ])
    );

    expect(options).toEqual([
      { value: "Health", label: "Health" },
      { value: "Personal", label: "Personal" },
    ]);
  });

  it("matches by normalized category and ending month", () => {
    const goals = new Map([
      ["goal-a", { category: "  Personal  ", end_date: "2026-08-31" }],
    ]);

    expect(
      goalPassesCalendarFilters({
        goalId: "goal-a",
        goalsByOriginalId: goals,
        categoryFilter: "Personal",
        allCategoriesValue,
        endMonthFilter: "2026-08",
      })
    ).toBe(true);
  });

  it("hides unknown goals when any filter is active", () => {
    const goals = new Map([
      ["goal-a", { category: "Personal", end_date: "2026-08-31" }],
    ]);

    expect(
      goalPassesCalendarFilters({
        goalId: "missing-goal",
        goalsByOriginalId: goals,
        categoryFilter: allCategoriesValue,
        allCategoriesValue,
        endMonthFilter: null,
      })
    ).toBe(true);
    expect(
      goalPassesCalendarFilters({
        goalId: "missing-goal",
        goalsByOriginalId: goals,
        categoryFilter: "Personal",
        allCategoriesValue,
        endMonthFilter: null,
      })
    ).toBe(false);
  });
});

