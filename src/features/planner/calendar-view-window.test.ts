import { describe, expect, it } from "vitest";
import { selectCalendarViewWindowModel } from "@/features/planner/calendar-view-window";

describe("selectCalendarViewWindowModel", () => {
  it("falls back to calendarToday when focused day is invalid", () => {
    const model = selectCalendarViewWindowModel({
      month: "2026-08",
      viewMode: "day",
      focusedDay: "not-a-day",
      focusedWeekDays: ["2026-08-10"],
      focusedThreeDayDays: ["2026-08-09", "2026-08-10", "2026-08-11"],
      calendarToday: "2026-08-10",
    });

    expect(model.resolvedFocusedDay).toBe("2026-08-10");
    expect(model.viewHeading).toContain("Aug");
  });

  it("uses week-sized step in week view", () => {
    const model = selectCalendarViewWindowModel({
      month: "2026-08",
      viewMode: "week",
      focusedDay: "2026-08-10",
      focusedWeekDays: [
        "2026-08-10",
        "2026-08-11",
        "2026-08-12",
        "2026-08-13",
        "2026-08-14",
        "2026-08-15",
        "2026-08-16",
      ],
      focusedThreeDayDays: ["2026-08-09", "2026-08-10", "2026-08-11"],
      calendarToday: "2026-08-10",
    });

    expect(model.stepDays).toBe(7);
  });
});
