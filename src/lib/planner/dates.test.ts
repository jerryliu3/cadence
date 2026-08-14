import { describe, expect, it } from "vitest";
import {
  MAX_ELIGIBLE_GOALS,
  MAX_PLANNER_WINDOW_DAYS,
  MAX_WORK_UNITS,
} from "@/lib/planner/contracts/bounds";
import {
  assertDateWindow,
  expandToMonthAlignedWindow,
  getScopeDateRange,
  isMonthAlignedPlannerWindow,
  toPlannerScheduleWindow,
} from "@/lib/planner/dates";

describe("planner month scope dates", () => {
  it("derives leap-month bounds", () => {
    expect(getScopeDateRange("2028-02")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("rejects impossible calendar months", () => {
    expect(() => getScopeDateRange("2026-13")).toThrow(RangeError);
  });

  it("maps a scope month to an inclusive schedule write window", () => {
    expect(toPlannerScheduleWindow("2026-08")).toEqual({
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    });
  });
});

describe("planner window capacity gate", () => {
  it("keeps 12-month daily worst-case above the kernel unit cap", () => {
    const twelveMonthDailyWorstCase = MAX_ELIGIBLE_GOALS * MAX_PLANNER_WINDOW_DAYS;
    expect(MAX_PLANNER_WINDOW_DAYS).toBe(366);
    expect(twelveMonthDailyWorstCase).toBeGreaterThan(MAX_WORK_UNITS);
  });
});

describe("isMonthAlignedPlannerWindow", () => {
  it("accepts a contiguous span of whole months", () => {
    expect(
      isMonthAlignedPlannerWindow({ start: "2026-08-01", end: "2026-09-30" })
    ).toBe(true);
    expect(
      isMonthAlignedPlannerWindow(getScopeDateRange("2028-02"))
    ).toBe(true);
  });

  it("rejects mid-month start or end dates", () => {
    expect(
      isMonthAlignedPlannerWindow({ start: "2026-09-10", end: "2026-09-20" })
    ).toBe(false);
    expect(
      isMonthAlignedPlannerWindow({ start: "2026-08-01", end: "2026-09-15" })
    ).toBe(false);
  });
});

describe("assertDateWindow", () => {
  it("accepts a whole-month span within the 366-day cap", () => {
    expect(assertDateWindow({ start: "2026-08-01", end: "2026-09-30" })).toEqual({
      start: "2026-08-01",
      end: "2026-09-30",
    });
  });

  it("rejects mid-month ranges before the day-count cap", () => {
    expect(() =>
      assertDateWindow({ start: "2026-09-10", end: "2026-09-20" })
    ).toThrow(/must start on day 1/);
  });
});

describe("expandToMonthAlignedWindow", () => {
  it("expands arbitrary visible dates to whole-month boundaries", () => {
    expect(
      expandToMonthAlignedWindow({
        start: "2026-01-31",
        end: "2026-02-02",
      })
    ).toEqual({
      start: "2026-01-01",
      end: "2026-02-28",
    });
  });
});
