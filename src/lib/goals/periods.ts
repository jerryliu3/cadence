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
  index: number
) {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("Period index must be a non-negative safe integer.");
  }

  if (interval === "daily") {
    return addDaysToDateString(anchorDate, index);
  }
  if (interval === "weekly") {
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
  referenceDate: string
): AnchoredPeriod {
  parseCivilDate(anchorDate);
  parseCivilDate(referenceDate);

  let index = 0;
  if (compareDateStrings(referenceDate, anchorDate) >= 0) {
    if (interval === "daily") {
      index = differenceInDateStrings(referenceDate, anchorDate);
    } else if (interval === "weekly") {
      index = Math.floor(
        differenceInDateStrings(referenceDate, anchorDate) / 7
      );
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
          getAnchoredPeriodStart(anchorDate, interval, index),
          referenceDate
        ) > 0
      ) {
        index -= 1;
      }
      while (
        compareDateStrings(
          getAnchoredPeriodStart(anchorDate, interval, index + 1),
          referenceDate
        ) <= 0
      ) {
        index += 1;
      }
    }
  }

  const start = getAnchoredPeriodStart(anchorDate, interval, index);
  const nextStart = getAnchoredPeriodStart(anchorDate, interval, index + 1);
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
