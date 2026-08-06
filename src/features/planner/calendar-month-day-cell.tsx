"use client";

import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  PlannerDraggableEntry,
  PlannerDroppableDay,
} from "@/features/planner/calendar-dnd";
import {
  getEntryDraftDiffSummary,
  getEntryDraftPillClasses,
} from "@/features/planner/calendar-format";
import { getGoalVisual } from "@/features/planner/goal-visuals";

export interface CalendarMonthCellEntryBase {
  key: string;
  originalGoalId: string;
  goalTitle: string | null;
  unitKey: string;
  label: string | null;
  classification: string;
  creditState: string;
  activeGoal: { color: string | null } | null;
  activeItem: { credited_completion_id: string | null } | null;
  draftDiffKind: "moved_from" | "moved_to" | "new" | null;
  draftDiffFromDate: string | null;
  draftDiffToDate: string | null;
  draftGhost: boolean;
}

export interface CalendarCompletionFactMarkerBase {
  key: string;
  goalTitle: string;
  scheduledDate: string | null;
}

interface CalendarMonthDayCellProps<
  TEntry extends CalendarMonthCellEntryBase,
  TCompletionFactMarker extends CalendarCompletionFactMarkerBase,
> {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  isPastInMonth: boolean;
  ariaLabel: string;
  entriesForDay: TEntry[];
  completionFactMarkersForDay: TCompletionFactMarker[];
  maxVisibleItems?: number;
  isAnyEntryDragging: boolean;
  getEntryDisplayTitle: (entry: TEntry) => string;
  isEntryCredited: (entry: TEntry) => boolean;
  isEntryImmovableForDraft: (entry: TEntry) => boolean;
  onEntryClick: (day: string, entry: TEntry) => void;
  onCellClick: (target: EventTarget & HTMLElement) => void;
  onCellMouseEnter: (target: EventTarget & HTMLElement) => void;
  onCellMouseLeave: () => void;
  onCellPointerDown: (
    pointerType: string,
    target: EventTarget & HTMLElement
  ) => void;
  onCellPointerUp: () => void;
  onCellPointerCancel: () => void;
  onCellPointerLeave: () => void;
  onEntryPointerStart: (immovable: boolean) => void;
  onEntryPointerEnd: () => void;
}

const DEFAULT_MAX_VISIBLE_ITEMS_PER_DAY_CELL = 2;

export function CalendarMonthDayCell<
  TEntry extends CalendarMonthCellEntryBase,
  TCompletionFactMarker extends CalendarCompletionFactMarkerBase,
>({
  day,
  inMonth,
  isToday,
  isPastInMonth,
  ariaLabel,
  entriesForDay,
  completionFactMarkersForDay,
  maxVisibleItems = DEFAULT_MAX_VISIBLE_ITEMS_PER_DAY_CELL,
  isAnyEntryDragging,
  getEntryDisplayTitle,
  isEntryCredited,
  isEntryImmovableForDraft,
  onEntryClick,
  onCellClick,
  onCellMouseEnter,
  onCellMouseLeave,
  onCellPointerDown,
  onCellPointerUp,
  onCellPointerCancel,
  onCellPointerLeave,
  onEntryPointerStart,
  onEntryPointerEnd,
}: CalendarMonthDayCellProps<TEntry, TCompletionFactMarker>) {
  const hasVisibleContent =
    entriesForDay.length > 0 || completionFactMarkersForDay.length > 0;
  const maxVisibleItemsPerCell = Number.isFinite(maxVisibleItems)
    ? Math.max(0, Math.floor(maxVisibleItems))
    : entriesForDay.length + completionFactMarkersForDay.length;
  const visibleEntries = entriesForDay.slice(0, maxVisibleItemsPerCell);
  const remainingSlots = Math.max(
    0,
    maxVisibleItemsPerCell - visibleEntries.length
  );
  const visibleCompletionFactMarkers = completionFactMarkersForDay.slice(
    0,
    remainingSlots
  );
  const hiddenItemCount =
    entriesForDay.length +
    completionFactMarkersForDay.length -
    visibleEntries.length -
    visibleCompletionFactMarkers.length;

  const renderEntry = (entry: TEntry): ReactNode => {
    const visual = getGoalVisual({
      goalId: entry.originalGoalId,
      color: entry.activeGoal?.color ?? null,
    });
    const Icon = visual.Icon;
    const compactTitle = getEntryDisplayTitle(entry);
    const credited = isEntryCredited(entry);
    const immovable = isEntryImmovableForDraft(entry);
    const draftDiffSummary = getEntryDraftDiffSummary(entry);
    const pillToneClasses = getEntryDraftPillClasses({
      draftDiffKind: entry.draftDiffKind,
      credited,
    });
    return (
      <PlannerDraggableEntry
        key={`cell-entry-${entry.key}`}
        entryKey={entry.key}
        disabled={immovable}
      >
        {({ setNodeRef, attributes, listeners, style, isDragging }) => (
          <div
            ref={setNodeRef}
            style={style}
            onClick={(event) => {
              event.stopPropagation();
              if (isDragging) {
                return;
              }
              onEntryClick(day, entry);
            }}
            onPointerDownCapture={() => {
              onEntryPointerStart(immovable);
            }}
            onPointerUpCapture={() => {
              onEntryPointerEnd();
            }}
            onPointerCancelCapture={() => {
              onEntryPointerEnd();
            }}
            className={`flex items-center gap-1 rounded-lg border px-1 py-0.5 text-[10px] ${pillToneClasses} ${
              entry.draftGhost ? "opacity-70 line-through" : ""
            } ${
              immovable
                ? "cursor-not-allowed"
                : "cursor-grab active:cursor-grabbing"
            } ${isDragging ? "pointer-events-none opacity-0" : ""}`}
            title={
              `${draftDiffSummary ? `${draftDiffSummary} ` : ""}${
                immovable
                  ? "Completed or historical sessions can't be moved in draft."
                  : "Drag to another day to create a draft move command."
              }`
            }
            data-calendar-day-entry="true"
            {...attributes}
            {...listeners}
          >
            <span
              className="inline-flex size-3 items-center justify-center rounded-full"
              style={{ backgroundColor: visual.color }}
            >
              <Icon className="size-2 text-white" />
            </span>
            <span className="truncate">{compactTitle}</span>
            {credited ? <CheckCircle2 className="size-2.5 shrink-0" /> : null}
          </div>
        )}
      </PlannerDraggableEntry>
    );
  };

  return (
    <PlannerDroppableDay day={day}>
      {({ setNodeRef, isOver }) => (
        <button
          ref={setNodeRef}
          type="button"
          onClick={(event) => onCellClick(event.currentTarget)}
          onMouseEnter={(event) => onCellMouseEnter(event.currentTarget)}
          onMouseLeave={onCellMouseLeave}
          onPointerDown={(event) => {
            const target =
              event.target instanceof Element
                ? event.target
                : event.target instanceof Node
                  ? event.target.parentElement
                  : null;
            if (
              target?.closest('[data-calendar-day-entry="true"]')
            ) {
              return;
            }
            onCellPointerDown(event.pointerType, event.currentTarget);
          }}
          onPointerUp={onCellPointerUp}
          onPointerCancel={onCellPointerCancel}
          onPointerLeave={onCellPointerLeave}
          className={`relative min-h-24 rounded-lg border p-2 text-left transition-colors ${
            inMonth
              ? isToday
                ? "bg-primary/10 ring-1 ring-primary/50 hover:border-primary"
                : isPastInMonth
                  ? "bg-muted/20 hover:border-primary/50"
                  : "bg-background hover:border-primary/60"
              : "bg-muted/30 text-muted-foreground"
          } ${isAnyEntryDragging && isOver ? "ring-2 ring-primary/70" : ""}`}
          aria-label={ariaLabel}
          data-no-swipe="true"
          data-day-cell="true"
          data-day={day}
        >
          <p
            className={`pointer-events-none absolute top-2 left-2 text-xs font-medium leading-none ${
              isToday ? "text-primary" : ""
            }`}
          >
            {day.slice(8, 10)}
          </p>
          {hasVisibleContent ? (
            <div className="mt-4 space-y-1">
              {visibleEntries.map(renderEntry)}
              {visibleCompletionFactMarkers.map((marker) => (
                <div
                  key={`completion-fact-${marker.key}`}
                  className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-100 px-1 py-0.5 text-[10px] text-emerald-950 dark:border-emerald-300 dark:bg-emerald-100 dark:text-emerald-950"
                  title={
                    marker.scheduledDate && marker.scheduledDate !== day
                      ? `Marked done here, currently credited from the ${marker.scheduledDate} scheduled session.`
                      : "Marked done on this date."
                  }
                >
                  <CheckCircle2 className="size-2.5 shrink-0" />
                  <span className="truncate">{marker.goalTitle}</span>
                </div>
              ))}
              {hiddenItemCount > 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  +{hiddenItemCount} more
                </p>
              ) : null}
            </div>
          ) : null}
        </button>
      )}
    </PlannerDroppableDay>
  );
}

