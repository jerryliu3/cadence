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

  it("builds a continuous 3-month window without duplicate day cells", () => {
    const projection = selectCalendarViewWindowProjection({
      month: "2026-08",
      selectedDay: null,
      calendarToday: "2026-08-11",
      weekStartsOn: 1,
      viewMode: "three_month",
    });

    expect(projection.focusedDay).toBe("2026-08-11");
    expect(projection.cells).toHaveLength(105);
    expect(projection.cells[0]?.date).toBe("2026-06-29");
    expect(projection.cells.at(-1)?.date).toBe("2026-10-11");
    expect(projection.visibleDays).toEqual(projection.cells.map((cell) => cell.date));
    expect(new Set(projection.visibleDays).size).toBe(projection.visibleDays.length);
    expect(projection.cellByDate.get("2026-06-29")?.inMonth).toBe(false);
    expect(projection.cellByDate.get("2026-07-01")?.inMonth).toBe(true);
    expect(projection.cellByDate.get("2026-08-15")?.inMonth).toBe(true);
    expect(projection.cellByDate.get("2026-09-30")?.inMonth).toBe(true);
    expect(projection.cellByDate.get("2026-10-11")?.inMonth).toBe(false);
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

  it("keeps day mode focused on a selected day while exposing the focused week window", () => {
    const projection = selectCalendarViewWindowProjection({
      month: "2026-08",
      selectedDay: "2026-08-23",
      calendarToday: "2026-08-11",
      weekStartsOn: 1,
      viewMode: "day",
    });

    expect(projection.focusedDay).toBe("2026-08-23");
    expect(projection.visibleDays).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
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
    expect(projection.visibleDays).toEqual(projection.focusedWeekDays);
    expect(projection.focusedThreeDayCells).toHaveLength(3);
  });
});
