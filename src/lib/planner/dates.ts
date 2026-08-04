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
