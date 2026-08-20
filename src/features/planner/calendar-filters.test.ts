import { describe, expect, it } from "vitest";
import { allCategoriesValue } from "@/features/goals/goal-filters";
import {
  applyCalendarCompletionMarkerFilters,
  buildCalendarCategoryFilterOptions,
  entryMatchesCalendarSearchQuery,
  goalPassesCalendarFilters,
  normalizeCalendarSearchQuery,
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

  it("keeps partner markers visible even when viewer filters are active", () => {
    const markers = applyCalendarCompletionMarkerFilters({
      viewerMarkers: [
        {
          key: "viewer-marker",
          originalGoalId: "viewer-goal",
          unitKey: "total:1",
          goalTitle: "Viewer goal",
          scheduledDate: "2026-08-15",
          owner: "viewer",
        },
      ],
      partnerMarkers: [
        {
          key: "partner-marker",
          originalGoalId: "partner-goal",
          unitKey: "partner-fact",
          goalTitle: "Partner goal",
          scheduledDate: "2026-08-15",
          owner: "partner",
        },
      ],
      goalPassesFilters: (goalId) => goalId === "viewer-other-goal",
    });

    expect(markers).toEqual([
      {
        key: "partner-marker",
        originalGoalId: "partner-goal",
        unitKey: "partner-fact",
        goalTitle: "Partner goal",
        scheduledDate: "2026-08-15",
        owner: "partner",
      },
    ]);
  });

  it("normalizes search query text for case-insensitive substring matching", () => {
    expect(normalizeCalendarSearchQuery("  Tempo Run  ")).toBe("tempo run");
  });

  it("matches goal title substrings case-insensitively", () => {
    expect(
      entryMatchesCalendarSearchQuery(
        {
          goalTitle: "Half Marathon Build",
          label: "Tempo run",
          unitKey: "milestone:2",
        },
        "marathon"
      )
    ).toBe(true);
  });

  it("matches milestone labels for milestone entries", () => {
    expect(
      entryMatchesCalendarSearchQuery(
        {
          goalTitle: "Half Marathon Build",
          label: "Tempo run 4x800",
          unitKey: "milestone:2",
        },
        "4x800"
      )
    ).toBe(true);
  });

  it("does not match non-milestone labels when goal title is present", () => {
    expect(
      entryMatchesCalendarSearchQuery(
        {
          goalTitle: "Hydration",
          label: "Drink two liters",
          unitKey: "total:1",
        },
        "drink"
      )
    ).toBe(false);
  });

  it("falls back to label matching when goal title is absent", () => {
    expect(
      entryMatchesCalendarSearchQuery(
        {
          goalTitle: null,
          label: "Strength session",
          unitKey: "total:1",
        },
        "strength"
      )
    ).toBe(true);
  });
});

