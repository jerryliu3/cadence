import { describe, expect, it } from "vitest";
import { selectCalendarViewWindowProjection } from "./calendar-view-projection";

describe("selectCalendarViewWindowProjection", () => {
  it("returns month cells and visible days for month mode", () => {
    const projection = selectCalendarViewWindowProjection({
      month: "2026-08",
      selectedDay: null,
      calendarToday: "2026-08-11",
      weekStartsOn: 1,
      viewMode: "month",
    });

    expect(projection.focusedDay).toBe("2026-08-11");
    expect(projection.cells).toHaveLength(42);
    expect(projection.visibleDays).toHaveLength(42);
    expect(projection.visibleDays[0]).toBe(projection.cells[0]?.date);
    expect(projection.visibleDays.at(-1)).toBe(projection.cells.at(-1)?.date);
  });

  it("returns focused week days and cells for week mode", () => {
    const projection = selectCalendarViewWindowProjection({
      month: "2026-08",
      selectedDay: "2026-08-20",
      calendarToday: "2026-08-11",
      weekStartsOn: 1,
      viewMode: "week",
    });

    expect(projection.focusedDay).toBe("2026-08-20");
    expect(projection.focusedWeekDays).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
    expect(projection.visibleDays).toEqual(projection.focusedWeekDays);
    expect(projection.focusedWeekCells).toHaveLength(7);
    expect(
      projection.focusedWeekCells.every((cell) => cell.inMonth)
    ).toBe(true);
  });

  it("uses selected day as the only visible day in day mode", () => {
    const projection = selectCalendarViewWindowProjection({
      month: "2026-08",
      selectedDay: "2026-08-23",
      calendarToday: "2026-08-11",
      weekStartsOn: 1,
      viewMode: "day",
    });

    expect(projection.focusedDay).toBe("2026-08-23");
    expect(projection.visibleDays).toEqual(["2026-08-23"]);
  });

  it("returns a centered 3-day window in three_day mode", () => {
    const projection = selectCalendarViewWindowProjection({
      month: "2026-08",
      selectedDay: "2026-08-23",
      calendarToday: "2026-08-11",
      weekStartsOn: 1,
      viewMode: "three_day",
    });

    expect(projection.focusedDay).toBe("2026-08-23");
    expect(projection.focusedThreeDayDays).toEqual([
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
    ]);
    expect(projection.visibleDays).toEqual(projection.focusedThreeDayDays);
    expect(projection.focusedThreeDayCells).toHaveLength(3);
  });
});
