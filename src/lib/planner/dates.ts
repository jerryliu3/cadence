import {
  addDaysToDateString,
  compareDateStrings,
  getAnchoredPeriod,
} from "@/lib/goals/periods";

export interface DateWindow {
  start: string;
  end: string;
}

export function getScopeDateRange(scopeMonth: string): DateWindow {
  const month = Number(scopeMonth.slice(5, 7));
  if (
    !/^\d{4}-\d{2}$/.test(scopeMonth) ||
    month < 1 ||
    month > 12
  ) {
    throw new RangeError(`Invalid scope month: ${scopeMonth}`);
  }
  const start = `${scopeMonth}-01`;
  return {
    start,
    end: getAnchoredPeriod(start, "monthly", start).end,
  };
}

export function toPlannerScheduleWindow(scopeMonth: string) {
  const window = getScopeDateRange(scopeMonth);
  return {
    start_date: window.start,
    end_date: window.end,
  };
}

export function intersectDateWindows(
  ...windows: Array<DateWindow | null>
): DateWindow | null {
  if (windows.some((window) => window === null)) {
    return null;
  }
  const present = windows as DateWindow[];
  const start = present.reduce(
    (latest, window) =>
      compareDateStrings(window.start, latest) > 0 ? window.start : latest,
    present[0]?.start ?? ""
  );
  const end = present.reduce(
    (earliest, window) =>
      compareDateStrings(window.end, earliest) < 0 ? window.end : earliest,
    present[0]?.end ?? ""
  );
  return compareDateStrings(start, end) <= 0 ? { start, end } : null;
}

export function enumerateDates(window: DateWindow) {
  const dates: string[] = [];
  for (
    let date = window.start;
    compareDateStrings(date, window.end) <= 0;
    date = addDaysToDateString(date, 1)
  ) {
    dates.push(date);
  }
  return dates;
}

export function dateIsInWindow(date: string, window: DateWindow) {
  return (
    compareDateStrings(date, window.start) >= 0 &&
    compareDateStrings(date, window.end) <= 0
  );
}

export function getUtcWeekday(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function getScopeState(scopeMonth: string, asOfDate: string) {
  const scope = getScopeDateRange(scopeMonth);
  if (compareDateStrings(asOfDate, scope.start) < 0) {
    return "future" as const;
  }
  if (compareDateStrings(asOfDate, scope.end) > 0) {
    return "historical" as const;
  }
  return "current" as const;
}

export function monthFromDate(date: string) {
  return date.slice(0, 7);
}

export function nextMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) {
    throw new Error(`Invalid month: ${month}`);
  }
  const nextYear = monthIndex === 12 ? year + 1 : year;
  const nextMonthNumber = monthIndex === 12 ? 1 : monthIndex + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonthNumber).padStart(2, "0")}`;
}

export function enumerateMonthsInWindow(window: DateWindow) {
  const startMonth = monthFromDate(window.start);
  const endMonth = monthFromDate(window.end);
  const months: string[] = [];
  for (let month = startMonth; month <= endMonth; month = nextMonth(month)) {
    months.push(month);
  }
  return months;
}
