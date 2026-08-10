import { format, parse } from "date-fns";
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { PlannerDragTarget } from "@/features/planner/calendar-dnd";
import {
  isEntryCredited,
  isValidIsoDate,
  moveItemInArray,
} from "@/features/planner/calendar-format";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";
import { buildPlannerEntryRowState } from "@/features/planner/planner-entry-row";
import type { QueueDraftMoveCommandInput } from "@/features/planner/use-planner-draft-entry-actions";

interface UsePlannerEntryDndOptions {
  entryByKey: Map<string, PlannerDayDetailEntry>;
  entryDayByKey: Map<string, string>;
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  getEntryDisplayTitle: (entry: PlannerDayDetailEntry) => string;
  queueDraftMoveCommand: (input: QueueDraftMoveCommandInput) => boolean;
  suppressHoverForDrag: () => void;
  releaseHoverSuppression: () => void;
  setPreviewEntryOrderByDay: Dispatch<SetStateAction<Record<string, string[]>>>;
}

export function usePlannerEntryDnd({
  entryByKey,
  entryDayByKey,
  entriesByDate,
  getEntryDisplayTitle,
  queueDraftMoveCommand,
  suppressHoverForDrag,
  releaseHoverSuppression,
  setPreviewEntryOrderByDay,
}: UsePlannerEntryDndOptions) {
  const [draggingEntryKey, setDraggingEntryKey] = useState<string | null>(null);

  const clearDragState = useCallback(() => {
    releaseHoverSuppression();
    setDraggingEntryKey(null);
  }, [releaseHoverSuppression]);

  const getDragEntryLabel = useCallback(
    (entryKey: string) => {
      const entry = entryByKey.get(entryKey);
      return entry ? getEntryDisplayTitle(entry) : "planner session";
    },
    [entryByKey, getEntryDisplayTitle]
  );

  const getDragDayLabel = useCallback((day: string) => {
    if (!isValidIsoDate(day)) {
      return day;
    }
    return format(parse(day, "yyyy-MM-dd", new Date()), "EEEE, MMMM d");
  }, []);

  const renderEntryDragOverlay = useCallback(
    (entryKey: string) => {
      const entry = entryByKey.get(entryKey);
      if (!entry) {
        return null;
      }
      const rowState = buildPlannerEntryRowState(entry);
      const Icon = rowState.visual.Icon;
      const title = getEntryDisplayTitle(entry);
      const credited = rowState.credited;
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
            style={{ backgroundColor: rowState.visual.color }}
          >
            <Icon className="size-2.5 text-white" />
          </span>
          <span className="truncate font-medium">{title}</span>
        </div>
      );
    },
    [entryByKey, getEntryDisplayTitle]
  );

  const handleDndEntryDragStart = useCallback(
    (entryKey: string) => {
      suppressHoverForDrag();
      setDraggingEntryKey(entryKey);
    },
    [suppressHoverForDrag]
  );

  const reorderPreviewEntriesForDay = useCallback(
    (day: string, activeEntryKey: string, overEntryKey: string) => {
      const entriesForDay = entriesByDate.get(day) ?? [];
      const incompleteKeys = entriesForDay
        .filter((entry) => !isEntryCredited(entry))
        .map((entry) => entry.key);
      const completedKeys = entriesForDay
        .filter((entry) => isEntryCredited(entry))
        .map((entry) => entry.key);
      const movingCompleted = completedKeys.includes(activeEntryKey);
      const targetGroupKeys = movingCompleted ? completedKeys : incompleteKeys;
      if (
        !targetGroupKeys.includes(activeEntryKey) ||
        !targetGroupKeys.includes(overEntryKey)
      ) {
        return;
      }
      setPreviewEntryOrderByDay((previous) => {
        const fallbackOrder = [...incompleteKeys, ...completedKeys];
        const existing = previous[day] ?? fallbackOrder;
        const normalized = [
          ...existing.filter((entryKey) => fallbackOrder.includes(entryKey)),
          ...fallbackOrder.filter((entryKey) => !existing.includes(entryKey)),
        ];
        const groupOrder = normalized.filter((entryKey) =>
          targetGroupKeys.includes(entryKey)
        );
        const fromIndex = groupOrder.indexOf(activeEntryKey);
        const toIndex = groupOrder.indexOf(overEntryKey);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return previous;
        }
        const nextGroupOrder = moveItemInArray(groupOrder, fromIndex, toIndex);
        const stableIncomplete = movingCompleted
          ? normalized.filter((entryKey) => incompleteKeys.includes(entryKey))
          : nextGroupOrder;
        const stableCompleted = movingCompleted
          ? nextGroupOrder
          : normalized.filter((entryKey) => completedKeys.includes(entryKey));
        const next = [...stableIncomplete, ...stableCompleted];
        return {
          ...previous,
          [day]: next,
        };
      });
    },
    [entriesByDate, setPreviewEntryOrderByDay]
  );

  const handleDndEntryDragEnd = useCallback(
    (entryKey: string, target: PlannerDragTarget) => {
      if (!target) {
        clearDragState();
        return;
      }
      const entry = entryByKey.get(entryKey);
      if (!entry) {
        clearDragState();
        return;
      }
      if (target.type === "preview_entry") {
        const sourceDay = entryDayByKey.get(entryKey) ?? null;
        if (sourceDay === target.day) {
          reorderPreviewEntriesForDay(target.day, entryKey, target.entryKey);
          clearDragState();
          return;
        }
        void queueDraftMoveCommand({
          entry,
          nextDate: target.day,
          source: "drag_drop",
        });
        clearDragState();
        return;
      }
      void queueDraftMoveCommand({
        entry,
        nextDate: target.day,
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
