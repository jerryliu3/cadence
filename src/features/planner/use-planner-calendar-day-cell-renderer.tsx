"use client";

import { format, parse } from "date-fns";
import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { CalendarMonthDayCell } from "@/features/planner/calendar-month-day-cell";
import {
  getDayStatus,
  getEntryCompactTitleWithTime,
  getEntryGoalFirstTitleWithTime,
  isEntryCredited,
  isEntryImmovableForDraft,
} from "@/features/planner/calendar-format";
import type {
  DayPreviewState,
  PlannerCalendarViewMode,
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { PlannerDayPreviewInteractions } from "@/features/planner/use-planner-day-preview-interactions";

interface PlannerCalendarCell {
  date: string;
  inMonth: boolean;
}

interface UsePlannerCalendarDayCellRendererArgs {
  viewMode: PlannerCalendarViewMode;
  expandedMonthRows: boolean;
  draggingEntryKey: string | null;
  calendarToday: string;
  focusedDay: string;
  plannerReadOnly: boolean;
  onSelectedDayChange: (
    day: string | null,
    mode: "push" | "replace",
    nextViewMode?: PlannerCalendarViewMode
  ) => void;
  setLocalSelectedDay: (day: string | null) => void;
  setSelectedEventEntryKey: (entryKey: string | null) => void;
  setDayPreview: Dispatch<SetStateAction<DayPreviewState | null>>;
  canMutateEntryOnDay: (entry: PlannerDayDetailEntry, day: string) => boolean;
  getOrderedEntriesForDay: (day: string | null) => PlannerDayDetailEntry[];
  getCompletionFactMarkersForDay: (day: string | null) => PlannerCompletionFactMarker[];
  dayPreviewInteractions: Pick<
    PlannerDayPreviewInteractions,
    | "clearHoverPreviewTimer"
    | "clearHoverPreviewCloseTimer"
    | "clearLongPressTimer"
    | "openDayPreview"
    | "handleDayCellClick"
    | "openDayViewForDay"
    | "scheduleHoverPreview"
    | "scheduleHoverPreviewClose"
    | "startLongPressPreview"
    | "pointerPressActiveRef"
    | "longPressTriggeredRef"
    | "lastTouchTapRef"
    | "suppressDayCellClickRef"
  >;
}

export function usePlannerCalendarDayCellRenderer({
  viewMode,
  expandedMonthRows,
  draggingEntryKey,
  calendarToday,
  focusedDay,
  plannerReadOnly,
  onSelectedDayChange,
  setLocalSelectedDay,
  setSelectedEventEntryKey,
  setDayPreview,
  canMutateEntryOnDay,
  getOrderedEntriesForDay,
  getCompletionFactMarkersForDay,
  dayPreviewInteractions,
}: UsePlannerCalendarDayCellRendererArgs) {
  const {
    clearHoverPreviewTimer,
    clearHoverPreviewCloseTimer,
    clearLongPressTimer,
    openDayPreview,
    handleDayCellClick,
    openDayViewForDay,
    scheduleHoverPreview,
    scheduleHoverPreviewClose,
    startLongPressPreview,
    pointerPressActiveRef,
    longPressTriggeredRef,
    lastTouchTapRef,
    suppressDayCellClickRef,
  } = dayPreviewInteractions;

  return useCallback(
    (cell: PlannerCalendarCell) => {
      const entriesForDay = getOrderedEntriesForDay(cell.date);
      const completionFactMarkersForDay = getCompletionFactMarkersForDay(cell.date);
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

      return (
        <CalendarMonthDayCell
          key={`${viewMode}-${cell.date}`}
          day={cell.date}
          inMonth={cell.inMonth}
          isToday={isToday}
          isPastInMonth={isPastInMonth}
          ariaLabel={ariaLabel}
          entriesForDay={entriesForDay}
          completionFactMarkersForDay={completionFactMarkersForDay}
          maxVisibleItems={
            viewMode === "week" || viewMode === "three_day"
              ? Number.MAX_SAFE_INTEGER
              : expandedMonthRows
                ? Number.MAX_SAFE_INTEGER
                : 2
          }
          isAnyEntryDragging={Boolean(draggingEntryKey)}
          getEntryDisplayTitle={
            viewMode === "month" || viewMode === "week" || viewMode === "three_day"
              ? getEntryCompactTitleWithTime
              : getEntryGoalFirstTitleWithTime
          }
          isEntryCredited={isEntryCredited}
          isEntryImmovableForDraft={(entry) =>
            plannerReadOnly ||
            !canMutateEntryOnDay(entry, cell.date) ||
            isEntryImmovableForDraft(entry)
          }
          onEntryClick={(day, entry, target) => {
            if (!canMutateEntryOnDay(entry, day)) {
              return;
            }
            if (viewMode === "day") {
              if (day !== focusedDay) {
                setLocalSelectedDay(day);
                onSelectedDayChange(day, "push", "day");
              }
              setSelectedEventEntryKey(entry.key);
              setDayPreview(null);
              return;
            }
            clearHoverPreviewTimer();
            clearHoverPreviewCloseTimer();
            setSelectedEventEntryKey(null);
            openDayPreview({ day, pinned: true, target });
          }}
          onCellClick={(target) => {
            if (draggingEntryKey) {
              return;
            }
            if (viewMode === "day") {
              if (cell.date !== focusedDay) {
                setLocalSelectedDay(cell.date);
                onSelectedDayChange(cell.date, "push", "day");
              }
              setDayPreview(null);
              return;
            }
            handleDayCellClick(cell.date, target);
          }}
          onCellDoubleClick={(target) => {
            void target;
            if (draggingEntryKey) {
              return;
            }
            clearHoverPreviewTimer();
            clearHoverPreviewCloseTimer();
            clearLongPressTimer();
            longPressTriggeredRef.current = false;
            openDayViewForDay(cell.date);
          }}
          onCellMouseEnter={(target) => {
            if (viewMode === "day") {
              return;
            }
            scheduleHoverPreview(cell.date, target);
          }}
          onCellMouseLeave={() => {
            if (viewMode === "day") {
              return;
            }
            clearHoverPreviewTimer();
            scheduleHoverPreviewClose(cell.date);
          }}
          onCellPointerDown={(pointerType, target) => {
            if (viewMode === "day") {
              return;
            }
            pointerPressActiveRef.current = true;
            clearHoverPreviewTimer();
            if (pointerType === "touch") {
              const now = Date.now();
              const lastTouchTap = lastTouchTapRef.current;
              if (
                lastTouchTap &&
                lastTouchTap.day === cell.date &&
                now - lastTouchTap.at < 350
              ) {
                clearLongPressTimer();
                longPressTriggeredRef.current = false;
                suppressDayCellClickRef.current = {
                  day: cell.date,
                  active: true,
                };
                openDayViewForDay(cell.date);
                return;
              }
              lastTouchTapRef.current = { day: cell.date, at: now };
              startLongPressPreview(cell.date, target);
            }
          }}
          onCellPointerUp={() => {
            if (viewMode === "day") {
              return;
            }
            pointerPressActiveRef.current = false;
            clearLongPressTimer();
          }}
          onCellPointerCancel={() => {
            if (viewMode === "day") {
              return;
            }
            pointerPressActiveRef.current = false;
            clearLongPressTimer();
          }}
          onCellPointerLeave={() => {
            if (viewMode === "day") {
              return;
            }
            clearLongPressTimer();
          }}
          onEntryPointerStart={(immovable) => {
            void immovable;
            pointerPressActiveRef.current = true;
            clearHoverPreviewTimer();
            setDayPreview(null);
          }}
          onEntryPointerEnd={() => {
            pointerPressActiveRef.current = false;
          }}
        />
      );
    },
    [
      calendarToday,
      canMutateEntryOnDay,
      clearHoverPreviewCloseTimer,
      clearHoverPreviewTimer,
      clearLongPressTimer,
      draggingEntryKey,
      expandedMonthRows,
      focusedDay,
      getCompletionFactMarkersForDay,
      getOrderedEntriesForDay,
      handleDayCellClick,
      longPressTriggeredRef,
      onSelectedDayChange,
      openDayPreview,
      openDayViewForDay,
      plannerReadOnly,
      pointerPressActiveRef,
      scheduleHoverPreview,
      scheduleHoverPreviewClose,
      setDayPreview,
      setLocalSelectedDay,
      setSelectedEventEntryKey,
      startLongPressPreview,
      suppressDayCellClickRef,
      lastTouchTapRef,
      viewMode,
    ]
  );
}
