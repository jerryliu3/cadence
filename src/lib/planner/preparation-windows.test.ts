import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/goals/types";
import {
  MAX_HORIZON_MONTHS,
  MAX_PLANNER_WINDOW_DAYS,
} from "@/lib/planner/contracts/bounds";
import { countDateWindowDays, isMonthAlignedPlannerWindow } from "@/lib/planner/dates";
import {
  buildGoalPreparationWindows,
  buildPreparationWindows,
} from "@/lib/planner/preparation-windows";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    owner_id: "22222222-2222-4222-8222-222222222222",
    title: "Goal",
    frequency_type: "fixed_milestones",
    recurrence_interval: null,
    target_count: 3,
    start_date: "2026-08-01",
    end_date: "2026-12-31",
    ...overrides,
  } as Goal;
}

describe("buildPreparationWindows", () => {
  it("covers exactly the horizon month span starting at the as-of month", () => {
    const windows = buildPreparationWindows("2026-08-14");

    expect(windows[0]?.start).toBe("2026-08-01");
    const monthsCovered = windows.reduce((total, window) => {
      const startMonth = Number(window.start.slice(5, 7));
      const startYear = Number(window.start.slice(0, 4));
      const endMonth = Number(window.end.slice(5, 7));
      const endYear = Number(window.end.slice(0, 4));
      return total + (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    }, 0);
    expect(monthsCovered).toBe(MAX_HORIZON_MONTHS);
  });

  it("keeps every window month-aligned and inside the write-boundary day cap", () => {
    for (const asOfDate of ["2026-08-14", "2027-01-01", "2027-12-31", "2028-02-29"]) {
      for (const window of buildPreparationWindows(asOfDate)) {
        expect(isMonthAlignedPlannerWindow(window)).toBe(true);
        expect(countDateWindowDays(window)).toBeLessThanOrEqual(
          MAX_PLANNER_WINDOW_DAYS
        );
      }
    }
  });

  it("produces contiguous, non-overlapping windows", () => {
    const windows = buildPreparationWindows("2026-08-14");
    for (let index = 1; index < windows.length; index += 1) {
      const previousEnd = Date.parse(`${windows[index - 1]!.end}T00:00:00.000Z`);
      const currentStart = Date.parse(`${windows[index]!.start}T00:00:00.000Z`);
      expect(currentStart - previousEnd).toBe(86_400_000);
    }
  });

  it("reaches the day cap exactly for a leap-year twelve-month chunk", () => {
    // Jan 2028 through Dec 2028 is 366 days, so the chunk size is deliberately
    // sized to the write boundary rather than accidentally under it.
    const windows = buildPreparationWindows("2028-01-05");
    expect(countDateWindowDays(windows[0]!)).toBe(MAX_PLANNER_WINDOW_DAYS);
  });

});

describe("buildGoalPreparationWindows", () => {
  const preparationStart = "2026-08-01";
  const preparationEnd = "2028-07-31";

  it("clamps the effective span to the goal's own end date", () => {
    const state = buildGoalPreparationWindows({
      goal: goal({ end_date: "2026-12-31" }),
      asOfDate: "2026-08-14",
      preparationStart,
      preparationEnd,
    });

    expect(state.effectiveEnd).toBe("2026-12-31");
    expect(state.windows.at(-1)?.end).toBe("2026-12-31");
  });

  it("floors the effective start at the as-of date for goals already underway", () => {
    const state = buildGoalPreparationWindows({
      goal: goal({ start_date: "2026-06-01" }),
      asOfDate: "2026-08-14",
      preparationStart,
      preparationEnd,
    });

    expect(state.effectiveStart).toBe("2026-08-14");
    expect(state.windows[0]?.start).toBe("2026-08-01");
  });

  it("uses the goal start when it begins after the as-of date", () => {
    const state = buildGoalPreparationWindows({
      goal: goal({ start_date: "2026-10-05", end_date: "2026-12-31" }),
      asOfDate: "2026-08-14",
      preparationStart,
      preparationEnd,
    });

    expect(state.effectiveStart).toBe("2026-10-05");
    expect(state.windows[0]?.start).toBe("2026-10-01");
  });

  it("returns no windows once the goal's end date has passed", () => {
    const state = buildGoalPreparationWindows({
      goal: goal({ start_date: "2026-01-01", end_date: "2026-07-31" }),
      asOfDate: "2026-08-14",
      preparationStart,
      preparationEnd,
    });

    expect(state.windows).toEqual([]);
  });

  it("falls back to the preparation end for open-ended goals", () => {
    const state = buildGoalPreparationWindows({
      goal: goal({
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        target_count: null,
        end_date: null,
      }),
      asOfDate: "2026-08-14",
      preparationStart,
      preparationEnd,
    });

    expect(state.effectiveEnd).toBe(preparationEnd);
  });

  it("chunks long lifetimes into month-aligned windows inside the day cap", () => {
    const state = buildGoalPreparationWindows({
      goal: goal({ end_date: "2028-07-31", target_count: 24 }),
      asOfDate: "2026-08-14",
      preparationStart,
      preparationEnd,
    });

    expect(state.windows.length).toBeGreaterThan(1);
    for (const window of state.windows) {
      expect(isMonthAlignedPlannerWindow(window)).toBe(true);
      expect(countDateWindowDays(window)).toBeLessThanOrEqual(
        MAX_PLANNER_WINDOW_DAYS
      );
    }
  });
});
