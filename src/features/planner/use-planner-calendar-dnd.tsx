"use client";

import { format, isValid, parse } from "date-fns";
import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { PlannerDragTarget } from "@/features/planner/calendar-dnd";
import { isEntryCredited } from "@/features/planner/calendar-format";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";
import { getGoalVisual } from "@/features/planner/goal-visuals";
import { resolvePlannerDndResolution } from "@/features/planner/planner-dnd-resolution";
import { reorderPreviewEntryKeys } from "@/features/planner/reorder-preview-entries";

interface UsePlannerCalendarDndArgs {
  entryByKey: Map<string, PlannerDayDetailEntry>;
  entryDayByKey: Map<string, string>;
  getEntriesForDay: (day: string) => PlannerDayDetailEntry[];
  getEntryGoalFirstTitleWithTime: (entry: PlannerDayDetailEntry) => string;
  setPreviewEntryOrderByDay: Dispatch<SetStateAction<Record<string, string[]>>>;
  queueDraftMoveCommand: (args: {
    entry: PlannerDayDetailEntry;
    nextDate: string;
    source: "date_input" | "drag_drop" | "coach";
  }) => boolean;
  clearHoverPreviewTimer: () => void;
  pointerPressActiveRef: MutableRefObject<boolean>;
}

export function usePlannerCalendarDnd({
  entryByKey,
  entryDayByKey,
  getEntriesForDay,
  getEntryGoalFirstTitleWithTime,
  setPreviewEntryOrderByDay,
  queueDraftMoveCommand,
  clearHoverPreviewTimer,
  pointerPressActiveRef,
}: UsePlannerCalendarDndArgs) {
  const [draggingEntryKey, setDraggingEntryKey] = useState<string | null>(null);

  const clearDragState = useCallback(() => {
    pointerPressActiveRef.current = false;
    setDraggingEntryKey(null);
  }, [pointerPressActiveRef]);

  const getDragEntryLabel = useCallback(
    (entryKey: string) => {
      const entry = entryByKey.get(entryKey);
      return entry ? getEntryGoalFirstTitleWithTime(entry) : "planner session";
    },
    [entryByKey, getEntryGoalFirstTitleWithTime]
  );

  const getDragDayLabel = useCallback((day: string) => {
    const parsedDay = parse(day, "yyyy-MM-dd", new Date());
    if (!isValid(parsedDay)) {
      return day;
    }
    return format(parsedDay, "EEEE, MMMM d");
  }, []);

  const renderEntryDragOverlay = useCallback(
    (entryKey: string) => {
      const entry = entryByKey.get(entryKey);
      if (!entry) {
        return null;
      }
      const visual = getGoalVisual({
        goalId: entry.originalGoalId,
        color: entry.activeGoal?.color ?? null,
        category: entry.activeGoal?.category ?? null,
      });
      const Icon = visual.Icon;
      const title = getEntryGoalFirstTitleWithTime(entry);
      const credited = isEntryCredited(entry);
      return (
        <div
          className={`flex max-w-64 items-center gap-2 rounded-lg border px-2 py-1 text-xs ${
            credited
              ? "border-emerald-300 bg-emerald-100 text-emerald-950"
              : "border-primary/40 bg-card text-foreground"
          }`}
        >
          <span
            className="inline-flex size-4 items-center justify-center rounded-full"
            style={{ backgroundColor: visual.color }}
          >
            <Icon className="size-2.5 text-white" />
          </span>
          <span className="truncate font-medium">{title}</span>
        </div>
      );
    },
    [entryByKey, getEntryGoalFirstTitleWithTime]
  );

  const handleDndEntryDragStart = useCallback(
    (entryKey: string) => {
      pointerPressActiveRef.current = true;
      clearHoverPreviewTimer();
      setDraggingEntryKey(entryKey);
    },
    [clearHoverPreviewTimer, pointerPressActiveRef]
  );

  const reorderPreviewEntriesForDay = useCallback(
    (day: string, activeEntryKey: string, overEntryKey: string) => {
      const entriesForDay = getEntriesForDay(day);
      const incompleteKeys = entriesForDay
        .filter((entry) => !isEntryCredited(entry))
        .map((entry) => entry.key);
      const completedKeys = entriesForDay
        .filter((entry) => isEntryCredited(entry))
        .map((entry) => entry.key);
      setPreviewEntryOrderByDay((previous) => {
        const next = reorderPreviewEntryKeys({
          incompleteKeys,
          completedKeys,
          activeEntryKey,
          overEntryKey,
          existingOrder: previous[day],
        });
        if (!next) {
          return previous;
        }
        return {
          ...previous,
          [day]: next,
        };
      });
    },
    [getEntriesForDay, setPreviewEntryOrderByDay]
  );

  const handleDndEntryDragEnd = useCallback(
    (entryKey: string, target: PlannerDragTarget) => {
      const resolution = resolvePlannerDndResolution({
        entryKey,
        target,
        entryByKey,
        entryDayByKey,
      });
      if (resolution.kind === "clear") {
        clearDragState();
        return;
      }
      if (resolution.kind === "reorder_preview") {
        reorderPreviewEntriesForDay(
          resolution.day,
          resolution.activeEntryKey,
          resolution.overEntryKey
        );
        clearDragState();
        return;
      }
      void queueDraftMoveCommand({
        entry: resolution.entry,
        nextDate: resolution.nextDate,
        source: "drag_drop",
      });
      clearDragState();
    },
    [
      clearDragState,
      entryByKey,
      entryDayByKey,
      queueDraftMoveCommand,
      reorderPreviewEntriesForDay,
    ]
  );

  const handleDndEntryDragCancel = useCallback(
    (entryKey: string | null) => {
      void entryKey;
      clearDragState();
    },
    [clearDragState]
  );

  return {
    draggingEntryKey,
    getDragEntryLabel,
    getDragDayLabel,
    renderEntryDragOverlay,
    handleDndEntryDragStart,
    handleDndEntryDragEnd,
    handleDndEntryDragCancel,
  };
}
