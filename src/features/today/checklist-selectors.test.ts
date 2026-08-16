import { describe, expect, it } from "vitest";
import {
  getGoalFacetCategoryKey,
  getRecurrenceGroup,
  groupGoalsByRecurrence,
  matchesTodayFacetFilters,
  selectFilteredTodayGoals,
} from "@/features/today/checklist-selectors";
import type { Goal } from "@/lib/goals/types";

const ALL_CATEGORIES = "__all_categories__";

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

/**
 * The goal form writes the display label to `category` and the catalog key to
 * `category_key`, so these fixtures mirror the shape of production rows.
 */
function categorizedGoal(
  id: string,
  category: string,
  categoryKey: string | undefined
): Goal {
  return goal({
    id,
    owner_id: "me",
    title: id,
    category,
    category_key: categoryKey,
    start_date: "2026-08-01",
  });
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
        categoryFilter: ALL_CATEGORIES,
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "all",
        searchQuery: "run",
        endMonth: null,
      }).map((row) => row.id)
    ).toEqual(["daily", "weekly"]);

    expect(
      selectFilteredTodayGoals({
        activeGoals: goals,
        todayDate: "2026-08-13",
        categoryFilter: "__all_categories__",
        allCategoriesFilterValue: "__all_categories__",
        recurrenceFilter: "all",
        searchQuery: "run",
        endMonth: null,
        completedGoalIds: new Set(["daily"]),
        showCompletedGoals: false,
      }).map((row) => row.id)
    ).toEqual(["weekly"]);
  });
});

describe("getGoalFacetCategoryKey", () => {
  it("resolves stored label/key pairs to the catalog key", () => {
    expect(
      getGoalFacetCategoryKey(categorizedGoal("labelled", "Health", "health"))
    ).toBe("health");
    expect(
      getGoalFacetCategoryKey(
        categorizedGoal("relationships", "Relationships", "relationships")
      )
    ).toBe("relationships");
  });

  it("resolves legacy rows that only carry a label", () => {
    expect(getGoalFacetCategoryKey(categorizedGoal("legacy", "Career", undefined))).toBe(
      "career"
    );
  });

  it("buckets custom categories under other", () => {
    expect(
      getGoalFacetCategoryKey(categorizedGoal("custom", "Woodworking", "other"))
    ).toBe("other");
  });
});

describe("matchesTodayFacetFilters", () => {
  it("matches a category facet against goals that store the display label", () => {
    const healthGoal = categorizedGoal("health", "Health", "health");
    expect(
      matchesTodayFacetFilters({
        goal: healthGoal,
        categoryFilter: "health",
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "all",
      })
    ).toBe(true);
    expect(
      matchesTodayFacetFilters({
        goal: healthGoal,
        categoryFilter: "career",
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "all",
      })
    ).toBe(false);
  });

  it("keeps every goal when the category facet is unset", () => {
    expect(
      matchesTodayFacetFilters({
        goal: categorizedGoal("health", "Health", "health"),
        categoryFilter: ALL_CATEGORIES,
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "all",
      })
    ).toBe(true);
  });

  it("matches custom categories through the other bucket", () => {
    expect(
      matchesTodayFacetFilters({
        goal: categorizedGoal("custom", "Woodworking", "other"),
        categoryFilter: "other",
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "all",
      })
    ).toBe(true);
  });

  it("applies recurrence facets independently of category", () => {
    const weekly = goal({
      id: "weekly",
      owner_id: "me",
      title: "Long run",
      category: "Health",
      category_key: "health",
      recurrence_interval: "weekly",
    });
    expect(
      matchesTodayFacetFilters({
        goal: weekly,
        categoryFilter: "health",
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "weekly",
      })
    ).toBe(true);
    expect(
      matchesTodayFacetFilters({
        goal: weekly,
        categoryFilter: "health",
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "daily",
      })
    ).toBe(false);
  });

  it("matches milestone goals only under the fixed recurrence facet", () => {
    const milestone = goal({
      id: "milestone",
      owner_id: "me",
      title: "Ship launch",
      category: "Career",
      category_key: "career",
      frequency_type: "fixed_milestones",
      recurrence_interval: null,
      target_count: 3,
    });
    expect(
      matchesTodayFacetFilters({
        goal: milestone,
        categoryFilter: ALL_CATEGORIES,
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "fixed",
      })
    ).toBe(true);
    expect(
      matchesTodayFacetFilters({
        goal: milestone,
        categoryFilter: ALL_CATEGORIES,
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "daily",
      })
    ).toBe(false);
  });
});

describe("selectFilteredTodayGoals category facet", () => {
  it("returns the goals in the selected category instead of filtering everything out", () => {
    const goals = [
      categorizedGoal("health", "Health", "health"),
      categorizedGoal("career", "Career", "career"),
      categorizedGoal("custom", "Woodworking", "other"),
    ];
    expect(
      selectFilteredTodayGoals({
        activeGoals: goals,
        todayDate: "2026-08-13",
        categoryFilter: "health",
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "all",
        searchQuery: "",
        endMonth: null,
      }).map((row) => row.id)
    ).toEqual(["health"]);
    expect(
      selectFilteredTodayGoals({
        activeGoals: goals,
        todayDate: "2026-08-13",
        categoryFilter: "other",
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "all",
        searchQuery: "",
        endMonth: null,
      }).map((row) => row.id)
    ).toEqual(["custom"]);
  });

  it("combines the category facet with search and recurrence", () => {
    const goals = [
      categorizedGoal("health-run", "Health", "health"),
      goal({
        id: "health-walk",
        owner_id: "me",
        title: "health-walk",
        category: "Health",
        category_key: "health",
        recurrence_interval: "weekly",
        start_date: "2026-08-01",
      }),
      categorizedGoal("career-run", "Career", "career"),
    ];
    expect(
      selectFilteredTodayGoals({
        activeGoals: goals,
        todayDate: "2026-08-13",
        categoryFilter: "health",
        allCategoriesFilterValue: ALL_CATEGORIES,
        recurrenceFilter: "daily",
        searchQuery: "run",
        endMonth: null,
      }).map((row) => row.id)
    ).toEqual(["health-run"]);
  });
});
