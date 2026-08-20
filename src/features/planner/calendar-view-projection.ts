import { addDays, format, isValid, parse } from "date-fns";
import type { PlannerCalendarViewMode } from "@/features/planner/calendar-surface.types";
import { buildMonthCells, type MonthCell } from "@/features/planner/month-cells";

export interface CalendarViewWindowProjection {
  cells: MonthCell[];
  cellByDate: Map<string, MonthCell>;
  focusedDay: string;
  focusedWeekDays: string[];
  focusedWeekCells: MonthCell[];
  focusedThreeDayDays: string[];
  focusedThreeDayCells: MonthCell[];
  visibleDays: string[];
}

export function buildFocusedWeekDays({
  focusedDay,
  calendarToday,
  weekStartsOn,
}: {
  focusedDay: string;
  calendarToday: string;
  weekStartsOn: number;
}) {
  const parsedFocusedDay = parse(focusedDay, "yyyy-MM-dd", new Date());
  const safeFocusedDay = isValid(parsedFocusedDay)
    ? parsedFocusedDay
    : parse(calendarToday, "yyyy-MM-dd", new Date());
  const weekStartOffset = (safeFocusedDay.getDay() - weekStartsOn + 7) % 7;
  const weekStart = addDays(safeFocusedDay, -weekStartOffset);
  return Array.from({ length: 7 }, (_, index) =>
    format(addDays(weekStart, index), "yyyy-MM-dd")
  );
}

export function buildFocusedWeekCells({
  month,
  cellByDate,
  focusedWeekDays,
}: {
  month: string | null;
  cellByDate: Map<string, MonthCell>;
  focusedWeekDays: string[];
}) {
  const monthPrefix = month ? `${month}-` : null;
  return focusedWeekDays.map((day) => {
    const existingCell = cellByDate.get(day);
    if (existingCell) {
      return existingCell;
    }
    return {
      date: day,
      inMonth: monthPrefix ? day.startsWith(monthPrefix) : false,
    } satisfies MonthCell;
  });
}

export function buildFocusedThreeDayDays({
  focusedDay,
  calendarToday,
}: {
  focusedDay: string;
  calendarToday: string;
}) {
  const parsedFocusedDay = parse(focusedDay, "yyyy-MM-dd", new Date());
  const safeFocusedDay = isValid(parsedFocusedDay)
    ? parsedFocusedDay
    : parse(calendarToday, "yyyy-MM-dd", new Date());
  return [-1, 0, 1].map((offset) =>
    format(addDays(safeFocusedDay, offset), "yyyy-MM-dd")
  );
}

export function buildFocusedThreeDayCells({
  month,
  cellByDate,
  focusedThreeDayDays,
}: {
  month: string | null;
  cellByDate: Map<string, MonthCell>;
  focusedThreeDayDays: string[];
}) {
  const monthPrefix = month ? `${month}-` : null;
  return focusedThreeDayDays.map((day) => {
    const existingCell = cellByDate.get(day);
    if (existingCell) {
      return existingCell;
    }
    return {
      date: day,
      inMonth: monthPrefix ? day.startsWith(monthPrefix) : false,
    } satisfies MonthCell;
  });
}

export function selectCalendarViewWindowProjection({
  month,
  selectedDay,
  calendarToday,
  weekStartsOn,
  viewMode,
}: {
  month: string | null;
  selectedDay: string | null;
  calendarToday: string;
  weekStartsOn: number;
  viewMode: PlannerCalendarViewMode;
}): CalendarViewWindowProjection {
  const cells = month ? buildMonthCells(month, weekStartsOn) : [];
  const cellByDate = new Map(cells.map((cell) => [cell.date, cell] as const));
  const focusedDay = selectedDay ?? calendarToday;
  const focusedWeekDays = buildFocusedWeekDays({
    focusedDay,
    calendarToday,
    weekStartsOn,
  });
  const focusedWeekCells = buildFocusedWeekCells({
    month,
    cellByDate,
    focusedWeekDays,
  });
  const focusedThreeDayDays = buildFocusedThreeDayDays({
    focusedDay,
    calendarToday,
  });
  const focusedThreeDayCells = buildFocusedThreeDayCells({
    month,
    cellByDate,
    focusedThreeDayDays,
  });
  const visibleDays =
    viewMode === "month" || viewMode === "three_month"
      ? cells.map((cell) => cell.date)
      : viewMode === "day" || viewMode === "three_day" || viewMode === "week"
        ? focusedWeekDays
        : [focusedDay];
  return {
    cells,
    cellByDate,
    focusedDay,
    focusedWeekDays,
    focusedWeekCells,
    focusedThreeDayDays,
    focusedThreeDayCells,
    visibleDays,
  };
}
