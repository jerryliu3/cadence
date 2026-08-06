import {
  addDays,
  endOfMonth,
  format,
  getDay,
  parse,
  startOfMonth,
} from "date-fns";

export interface MonthCell {
  date: string;
  inMonth: boolean;
}

function normalizeWeekStartsOn(weekStartsOn: number) {
  return Number.isInteger(weekStartsOn) && weekStartsOn >= 0 && weekStartsOn <= 6
    ? weekStartsOn
    : 1;
}

function parseMonth(month: string) {
  return parse(`${month}-01`, "yyyy-MM-dd", new Date());
}

function toIsoDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function buildMonthCells(month: string, weekStartsOn = 1) {
  const monthStart = startOfMonth(parseMonth(month));
  const monthEnd = endOfMonth(monthStart);
  const normalizedWeekStartsOn = normalizeWeekStartsOn(weekStartsOn);
  const startOffset = (getDay(monthStart) - normalizedWeekStartsOn + 7) % 7;
  const gridStart = addDays(monthStart, -startOffset);
  const cells: MonthCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    cells.push({
      date: toIsoDate(date),
      inMonth: date >= monthStart && date <= monthEnd,
    });
  }

  return cells;
}

export function buildMondayFirstMonthCells(month: string) {
  return buildMonthCells(month, 1);
}
