import { format, parse } from "date-fns";
import type { PlannerEntryDateFactDispatch } from "@/features/planner/calendar-completion-selectors";
import {
  completionDisabledReasonCopy,
  getDayStatus,
} from "@/features/planner/calendar-format";
import type {
  CompletionControlDisabledReason,
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { PlannerCalendarDayProjection } from "@/features/planner/calendar-store-selectors";

export interface PlannerCalendarDayCellRenderModel {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  isPastInMonth: boolean;
  ariaLabel: string;
  entriesForDay: PlannerDayDetailEntry[];
  completionFactMarkersForDay: PlannerCompletionFactMarker[];
}

export interface PlannerEntryCompletionToggleViewModel {
  currentlyCredited: boolean;
  disabledReasonCopy: string | null;
}

export function selectPlannerCalendarDayCellRenderModel({
  cell,
  dayProjection,
  calendarToday,
}: {
  cell: {
    date: string;
    inMonth: boolean;
  };
  dayProjection: PlannerCalendarDayProjection;
  calendarToday: string;
}): PlannerCalendarDayCellRenderModel {
  const entriesForDay = dayProjection.orderedEntries;
  const completionFactMarkersForDay = dayProjection.completionFactMarkers;
  const status =
    entriesForDay.length > 0
      ? getDayStatus(entriesForDay, "No items")
      : completionFactMarkersForDay.length > 0
        ? "Completed elsewhere"
        : "No items";
  const isToday = cell.date === calendarToday;
  const isPastInMonth = cell.inMonth && cell.date < calendarToday;
  const ariaLabel = `${format(
    parse(cell.date, "yyyy-MM-dd", new Date()),
    "EEEE, MMMM d, yyyy"
  )}. ${entriesForDay.length} planned item${
    entriesForDay.length === 1 ? "" : "s"
  }. ${completionFactMarkersForDay.length} completion fact${
    completionFactMarkersForDay.length === 1 ? "" : "s"
  }. ${status}.`;

  return {
    day: cell.date,
    inMonth: cell.inMonth,
    isToday,
    isPastInMonth,
    ariaLabel,
    entriesForDay,
    completionFactMarkersForDay,
  };
}

export function selectPlannerEntryCompletionToggleViewModel({
  entry,
  day,
  canMutateEntryOnDay,
  isEntryCredited,
  readOnlyMonthHint,
  getDateFactDispatchForEntry,
  completionControlDisabledReasonForEntry,
}: {
  entry: PlannerDayDetailEntry;
  day: string;
  canMutateEntryOnDay: (
    entry: PlannerDayDetailEntry,
    day: string | null
  ) => boolean;
  isEntryCredited: (entry: PlannerDayDetailEntry) => boolean;
  readOnlyMonthHint: string;
  getDateFactDispatchForEntry: (
    entry: PlannerDayDetailEntry,
    selectedDate?: string | null
  ) => PlannerEntryDateFactDispatch | null;
  completionControlDisabledReasonForEntry: (
    entry: PlannerDayDetailEntry,
    dispatch: PlannerEntryDateFactDispatch | null
  ) => CompletionControlDisabledReason | null;
}): PlannerEntryCompletionToggleViewModel {
  if (!canMutateEntryOnDay(entry, day)) {
    return {
      currentlyCredited: isEntryCredited(entry),
      disabledReasonCopy: readOnlyMonthHint,
    };
  }

  const completionDispatch = getDateFactDispatchForEntry(entry, day);
  const completionDisabledReason = completionControlDisabledReasonForEntry(
    entry,
    completionDispatch
  );
  return {
    currentlyCredited: Boolean(completionDispatch?.currentlyCredited),
    disabledReasonCopy: completionDisabledReason
      ? completionDisabledReasonCopy(completionDisabledReason)
      : null,
  };
}
