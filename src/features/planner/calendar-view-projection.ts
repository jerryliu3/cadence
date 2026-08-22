import { addDays, addMonths, format, isValid, parse } from "date-fns";
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

export interface CalendarVisibleDateWindow {
  start: string;
  end: string;
}

export function buildCalendarVisibleDateWindow(
  visibleDays: readonly string[]
): CalendarVisibleDateWindow | null {
  if (visibleDays.length === 0) {
    return null;
  }
  let start = visibleDays[0];
  let end = visibleDays[0];
  for (const day of visibleDays) {
    if (day < start) {
      start = day;
    }
    if (day > end) {
      end = day;
    }
  }
  return { start, end };
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

function buildMultiMonthCells({
  month,
  weekStartsOn,
  monthsBefore,
  monthsAfter,
}: {
  month: string;
  weekStartsOn: number;
  monthsBefore: number;
  monthsAfter: number;
}) {
  const centerMonthDate = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  if (!isValid(centerMonthDate)) {
    return buildMonthCells(month, weekStartsOn);
  }
  const rangeStartMonth = format(
    addMonths(centerMonthDate, -monthsBefore),
    "yyyy-MM"
  );
  const rangeEndMonth = format(
    addMonths(centerMonthDate, monthsAfter),
    "yyyy-MM"
  );
  const rangeStartCells = buildMonthCells(rangeStartMonth, weekStartsOn);
  const rangeEndCells = buildMonthCells(rangeEndMonth, weekStartsOn);
  const rangeStart = rangeStartCells[0]?.date;
  const rangeEnd = rangeEndCells.at(-1)?.date;
  if (!rangeStart || !rangeEnd) {
    return [];
  }
  const rangeStartDate = parse(rangeStart, "yyyy-MM-dd", new Date());
  const rangeEndDate = parse(rangeEnd, "yyyy-MM-dd", new Date());
  if (!isValid(rangeStartDate) || !isValid(rangeEndDate)) {
    return [];
  }
  const monthPrefix = `${month}-`;
  const cells: MonthCell[] = [];
  for (
    let day = rangeStartDate;
    day <= rangeEndDate;
    day = addDays(day, 1)
  ) {
    const isoDay = format(day, "yyyy-MM-dd");
    cells.push({
      date: isoDay,
      inMonth: isoDay.startsWith(monthPrefix),
    });
  }
  return cells;
}

function buildViewModeCells({
  month,
  weekStartsOn,
  viewMode,
}: {
  month: string | null;
  weekStartsOn: number;
  viewMode: PlannerCalendarViewMode;
}) {
  if (!month) {
    return [];
  }
  switch (viewMode) {
    case "month":
      return buildMultiMonthCells({
        month,
        weekStartsOn,
        monthsBefore: 1,
        monthsAfter: 1,
      });
    case "week":
    case "three_day":
    case "day":
      return buildMonthCells(month, weekStartsOn);
  }
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
  const cells = buildViewModeCells({
    month,
    weekStartsOn,
    viewMode,
  });
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
    viewMode === "month"
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
