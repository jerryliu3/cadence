import { format } from "date-fns";

export function toLocalDateString(date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}

export type SelectedDateState = "past" | "today" | "future";

export function resolveSelectedDateState(
  selectedDate: string,
  todayDate: string
): SelectedDateState {
  if (selectedDate < todayDate) {
    return "past";
  }
  if (selectedDate > todayDate) {
    return "future";
  }
  return "today";
}
