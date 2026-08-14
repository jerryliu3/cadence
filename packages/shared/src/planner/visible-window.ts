import { addMonths, endOfMonth, format, parse, startOfMonth } from "date-fns";
import { isValidMonth } from "./calendar-state";

export interface PlannerDateWindow {
  start: string;
  end: string;
}

export function buildPlannerVisibleWindow(
  scopeMonth: string
): PlannerDateWindow {
  if (!isValidMonth(scopeMonth)) {
    throw new RangeError("Planner scope month must use YYYY-MM.");
  }
  const month = parse(`${scopeMonth}-01`, "yyyy-MM-dd", new Date());
  return {
    start: format(startOfMonth(addMonths(month, -1)), "yyyy-MM-dd"),
    end: format(endOfMonth(addMonths(month, 1)), "yyyy-MM-dd"),
  };
}
