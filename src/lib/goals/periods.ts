import type { RecurrenceInterval } from "@/lib/goals/types";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

function civilDateToUtcDate({ year, month, day }: CivilDate) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export interface AnchoredPeriod {
  index: number;
  start: string;
  end: string;
  nextStart: string;
  periodKey: string;
}

export interface WeeklyAnchorContext {
  weekStartsOn?: number | null;
}

function parseCivilDate(value: string): CivilDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = civilDateToUtcDate({ year, month, day });

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }

  return { year, month, day };
}

function formatCivilDate({ year, month, day }: CivilDate) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

function civilDateToEpochDay(value: string) {
  return Math.floor(
    civilDateToUtcDate(parseCivilDate(value)).getTime() /
      MILLISECONDS_PER_DAY
  );
}

function epochDayToCivilDate(epochDay: number) {
  const date = new Date(epochDay * MILLISECONDS_PER_DAY);
  return formatCivilDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function getUtcWeekday(value: string) {
  return civilDateToUtcDate(parseCivilDate(value)).getUTCDay();
}

function startOfWeekDateString(value: string, weekStartsOn: number) {
  const normalizedWeekStartsOn = normalizeWeekStartsOn(weekStartsOn);
  const weekday = getUtcWeekday(value);
  const offset = (weekday - normalizedWeekStartsOn + 7) % 7;
  return addDaysToDateString(value, -offset);
}

function monthStartDateString(value: string) {
  const civilDate = parseCivilDate(value);
  return formatCivilDate({
    year: civilDate.year,
    month: civilDate.month,
    day: 1,
  });
}

function addMonthsToMonthStart(value: string, months: number) {
  if (!Number.isSafeInteger(months)) {
    throw new RangeError("months must be a safe integer.");
  }
  const anchor = parseCivilDate(monthStartDateString(value));
  const zeroBasedMonth = anchor.month - 1 + months;
  const year = anchor.year + Math.floor(zeroBasedMonth / 12);
  const month = ((zeroBasedMonth % 12) + 12) % 12 + 1;
  return formatCivilDate({
    year,
    month,
    day: 1,
  });
}

export function compareDateStrings(left: string, right: string) {
  parseCivilDate(left);
  parseCivilDate(right);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function addDaysToDateString(value: string, days: number) {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError("days must be a safe integer.");
  }
  return epochDayToCivilDate(civilDateToEpochDay(value) + days);
}

export function differenceInDateStrings(later: string, earlier: string) {
  return civilDateToEpochDay(later) - civilDateToEpochDay(earlier);
}

export function getAnchoredPeriodStart(
  anchorDate: string,
  interval: RecurrenceInterval,
  index: number,
  weeklyAnchor?: WeeklyAnchorContext | null
) {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("Period index must be a non-negative safe integer.");
  }

  if (interval === "daily") {
    return addDaysToDateString(anchorDate, index);
  }
  if (interval === "weekly") {
    const weekStartsOn = normalizeWeekStartsOn(weeklyAnchor?.weekStartsOn);
    const anchorWeekStart = startOfWeekDateString(anchorDate, weekStartsOn);
    return addDaysToDateString(anchorWeekStart, index * 7);
  }
  return addMonthsToMonthStart(monthStartDateString(anchorDate), index);
}

export function getAnchoredPeriod(
  anchorDate: string,
  interval: RecurrenceInterval,
  referenceDate: string,
  weeklyAnchor?: WeeklyAnchorContext | null
): AnchoredPeriod {
  parseCivilDate(anchorDate);
  parseCivilDate(referenceDate);

  let index = 0;
  if (compareDateStrings(referenceDate, anchorDate) >= 0) {
    if (interval === "daily") {
      index = differenceInDateStrings(referenceDate, anchorDate);
    } else if (interval === "weekly") {
      const weekStartsOn = normalizeWeekStartsOn(weeklyAnchor?.weekStartsOn);
      const anchorWeekStart = startOfWeekDateString(anchorDate, weekStartsOn);
      const referenceWeekStart = startOfWeekDateString(
        referenceDate,
        weekStartsOn
      );
      index = Math.floor(
        differenceInDateStrings(referenceWeekStart, anchorWeekStart) / 7
      );
    } else {
      const anchorMonth = parseCivilDate(monthStartDateString(anchorDate));
      const referenceMonth = parseCivilDate(monthStartDateString(referenceDate));
      index = Math.max(
        0,
        (referenceMonth.year - anchorMonth.year) * 12 +
          (referenceMonth.month - anchorMonth.month)
      );
    }
  }

  const start = getAnchoredPeriodStart(
    anchorDate,
    interval,
    index,
    weeklyAnchor
  );
  const nextStart = getAnchoredPeriodStart(
    anchorDate,
    interval,
    index + 1,
    weeklyAnchor
  );
  const end =
    interval === "daily" ? start : addDaysToDateString(nextStart, -1);

  return {
    index,
    start,
    end,
    nextStart,
    periodKey: start,
  };
}
