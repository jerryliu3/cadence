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

function parseMonth(month: string) {
  return parse(`${month}-01`, "yyyy-MM-dd", new Date());
}

function toIsoDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function buildMondayFirstMonthCells(month: string) {
  const monthStart = startOfMonth(parseMonth(month));
  const monthEnd = endOfMonth(monthStart);
  const mondayIndex = (getDay(monthStart) + 6) % 7;
  const gridStart = addDays(monthStart, -mondayIndex);
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
