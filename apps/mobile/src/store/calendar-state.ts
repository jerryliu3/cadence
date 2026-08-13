import {
  normalizeCalendarState,
  type PlannerCalendarViewMode,
} from "@cadence/shared/planner/calendar-state";
import { format } from "date-fns";
import { create } from "zustand";

const defaultMonth = format(new Date(), "yyyy-MM");

export const useCalendarStore = create<{
  tab: "today" | "not-today" | "calendar";
  month: string | null;
  day: string | null;
  viewMode: PlannerCalendarViewMode;
  apply: (
    partial: Partial<{
      month: string | null;
      day: string | null;
      viewMode: PlannerCalendarViewMode;
    }>
  ) => void;
}>((set, get) => ({
  ...normalizeCalendarState({
    tab: "calendar",
    month: defaultMonth,
    defaultCalendarViewMode: "month",
    surface: "calendar",
  }),
  apply: (partial) => {
    const current = get();
    set(
      normalizeCalendarState({
        tab: "calendar",
        month: partial.month ?? current.month,
        day: partial.day ?? current.day,
        viewMode: partial.viewMode ?? current.viewMode,
        defaultCalendarViewMode: "month",
        surface: "calendar",
      })
    );
  },
}));
