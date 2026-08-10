import {
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
} from "date-fns";

export function getThisMonthStartDate(reference = new Date()): string {
  return format(startOfMonth(reference), "yyyy-MM-dd");
}

export function getThisMonthEndDate(reference = new Date()): string {
  return format(endOfMonth(reference), "yyyy-MM-dd");
}

export function getThisYearStartDate(reference = new Date()): string {
  return format(startOfYear(reference), "yyyy-MM-dd");
}

export function getThisYearEndDate(reference = new Date()): string {
  return format(endOfYear(reference), "yyyy-MM-dd");
}
