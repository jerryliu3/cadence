import { format } from "date-fns";

export function toLocalDateString(date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}
