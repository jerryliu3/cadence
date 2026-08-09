import type { RecurrenceInterval } from "@/lib/goals/types";

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
  effectiveFrom?: string | null;
}

export interface AnchoredPeriodOptions {
  weekly?: WeeklyAnchorContext | null;
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

function normalizeWeekStartsOn(value: number | null | undefined) {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 6
  ) {
    return value;
  }
  return 1;
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

function parseWeeklyAnchorMeta(
  anchorDate: string,
  weekly: WeeklyAnchorContext | null | undefined
) {
  if (!weekly?.effectiveFrom) {
    return null;
  }
  parseCivilDate(weekly.effectiveFrom);
  const weekStartsOn = normalizeWeekStartsOn(weekly.weekStartsOn);
  const effectiveFrom = weekly.effectiveFrom;
  const dayBeforeCutover = addDaysToDateString(effectiveFrom, -1);
  const lastLegacyIndex =
    compareDateStrings(dayBeforeCutover, anchorDate) < 0
      ? -1
      : Math.floor(differenceInDateStrings(dayBeforeCutover, anchorDate) / 7);
  return {
    weekStartsOn,
    effectiveFrom,
    lastLegacyIndex,
  };
}

export function getNextWeekStartOnOrAfter(
  date: string,
  weekStartsOn: number
) {
  parseCivilDate(date);
  const weekStart = startOfWeekDateString(date, weekStartsOn);
  if (compareDateStrings(weekStart, date) === 0) {
    return weekStart;
  }
  return addDaysToDateString(weekStart, 7);
}

function daysInMonth(year: number, month: number) {
  return civilDateToUtcDate({ year, month: month + 1, day: 0 }).getUTCDate();
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
  options?: AnchoredPeriodOptions
) {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("Period index must be a non-negative safe integer.");
  }

  if (interval === "daily") {
    return addDaysToDateString(anchorDate, index);
  }
  if (interval === "weekly") {
    const weeklyAnchorMeta = parseWeeklyAnchorMeta(
      anchorDate,
      options?.weekly ?? null
    );
    if (
      weeklyAnchorMeta &&
      index > weeklyAnchorMeta.lastLegacyIndex
    ) {
      return addDaysToDateString(
        weeklyAnchorMeta.effectiveFrom,
        (index - weeklyAnchorMeta.lastLegacyIndex - 1) * 7
      );
    }
    return addDaysToDateString(anchorDate, index * 7);
  }

  const anchor = parseCivilDate(anchorDate);
  const zeroBasedMonth = anchor.month - 1 + index;
  const year = anchor.year + Math.floor(zeroBasedMonth / 12);
  const month = ((zeroBasedMonth % 12) + 12) % 12 + 1;

  return formatCivilDate({
    year,
    month,
    day: Math.min(anchor.day, daysInMonth(year, month)),
  });
}

export function getAnchoredPeriod(
  anchorDate: string,
  interval: RecurrenceInterval,
  referenceDate: string,
  options?: AnchoredPeriodOptions
): AnchoredPeriod {
  parseCivilDate(anchorDate);
  parseCivilDate(referenceDate);
  const weeklyAnchorMeta =
    interval === "weekly"
      ? parseWeeklyAnchorMeta(anchorDate, options?.weekly ?? null)
      : null;

  let index = 0;
  if (compareDateStrings(referenceDate, anchorDate) >= 0) {
    if (interval === "daily") {
      index = differenceInDateStrings(referenceDate, anchorDate);
    } else if (interval === "weekly") {
      if (
        weeklyAnchorMeta &&
        compareDateStrings(referenceDate, weeklyAnchorMeta.effectiveFrom) >= 0
      ) {
        const alignedStart = startOfWeekDateString(
          referenceDate,
          weeklyAnchorMeta.weekStartsOn
        );
        const boundedStart =
          compareDateStrings(alignedStart, weeklyAnchorMeta.effectiveFrom) < 0
            ? weeklyAnchorMeta.effectiveFrom
            : alignedStart;
        index =
          weeklyAnchorMeta.lastLegacyIndex +
          1 +
          Math.floor(
            differenceInDateStrings(
              boundedStart,
              weeklyAnchorMeta.effectiveFrom
            ) / 7
          );
      } else {
        index = Math.floor(
          differenceInDateStrings(referenceDate, anchorDate) / 7
        );
      }
    } else {
      const anchor = parseCivilDate(anchorDate);
      const reference = parseCivilDate(referenceDate);
      index = Math.max(
        0,
        (reference.year - anchor.year) * 12 +
          (reference.month - anchor.month)
      );

      while (
        index > 0 &&
        compareDateStrings(
          getAnchoredPeriodStart(anchorDate, interval, index, options),
          referenceDate
        ) > 0
      ) {
        index -= 1;
      }
      while (
        compareDateStrings(
          getAnchoredPeriodStart(anchorDate, interval, index + 1, options),
          referenceDate
        ) <= 0
      ) {
        index += 1;
      }
    }
  }

  const start = getAnchoredPeriodStart(anchorDate, interval, index, options);
  const nextStart = getAnchoredPeriodStart(
    anchorDate,
    interval,
    index + 1,
    options
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
