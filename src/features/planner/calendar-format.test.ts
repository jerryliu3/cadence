import { describe, expect, it } from "vitest";
import {
  buildWeekdayLabels,
  normalizeWeekStartsOn,
} from "@/features/planner/calendar-format";

describe("calendar format week start helpers", () => {
  it("defaults invalid week start values to Monday", () => {
    expect(normalizeWeekStartsOn(undefined)).toBe(1);
    expect(normalizeWeekStartsOn(null)).toBe(1);
    expect(normalizeWeekStartsOn(-1)).toBe(1);
    expect(normalizeWeekStartsOn(9)).toBe(1);
  });

  it("builds weekday headers from a configured start day", () => {
    expect(buildWeekdayLabels(1)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(buildWeekdayLabels(0)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });
});
