import {
  endOfMonth,
  endOfISOWeek,
  format,
  isBefore,
  parseISO,
  startOfDay,
  startOfISOWeek,
  startOfMonth,
} from "date-fns";

export function toLocalDateString(date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateString(value: string): Date {
  return parseISO(value);
}

export function isPastDate(value: string, referenceDate = new Date()): boolean {
  return isBefore(parseDateString(value), startOfDay(referenceDate));
}

export function getCurrentWeekRange(referenceDate = new Date()) {
  return {
    start: startOfISOWeek(referenceDate),
    end: endOfISOWeek(referenceDate),
  };
}

export function getCurrentMonthRange(referenceDate = new Date()) {
  return {
    start: startOfMonth(referenceDate),
    end: endOfMonth(referenceDate),
  };
}
