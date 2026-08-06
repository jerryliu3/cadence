"use client";

import { CheckCircle2, Circle } from "lucide-react";
import {
  PlannerDraggablePreviewEntry,
} from "@/features/planner/calendar-dnd";
import {
  type CalendarCompletionFactMarkerBase,
  type CalendarMonthCellEntryBase,
} from "@/features/planner/calendar-month-day-cell";
import { getGoalVisual } from "@/features/planner/goal-visuals";

interface PreviewCompletionToggleState {
  currentlyCredited: boolean;
  disabledReasonCopy: string | null;
}

interface CalendarDayPreviewListProps<
  TEntry extends CalendarMonthCellEntryBase,
  TCompletionFactMarker extends CalendarCompletionFactMarkerBase,
> {
  day: string;
  entries: TEntry[];
  completionFactMarkers: TCompletionFactMarker[];
  mutationLoading: boolean;
  getEntryDisplayTitle: (entry: TEntry) => string;
  getEntrySubtitle: (entry: TEntry) => string | null;
  isEntryCredited: (entry: TEntry) => boolean;
  isEntryImmovableForDraft: (entry: TEntry) => boolean;
  getCompletionToggleState: (entry: TEntry, day: string) => PreviewCompletionToggleState;
  onEntryOpen: (entryKey: string) => void;
  onToggleCompletion: (entry: TEntry, day: string) => void;
  onEntryPointerStart: (immovable: boolean) => void;
  onEntryPointerEnd: () => void;
}

export function CalendarDayPreviewList<
  TEntry extends CalendarMonthCellEntryBase,
  TCompletionFactMarker extends CalendarCompletionFactMarkerBase,
>({
  day,
  entries,
  completionFactMarkers,
  mutationLoading,
  getEntryDisplayTitle,
  getEntrySubtitle,
  isEntryCredited,
  isEntryImmovableForDraft,
  getCompletionToggleState,
  onEntryOpen,
  onToggleCompletion,
  onEntryPointerStart,
  onEntryPointerEnd,
}: CalendarDayPreviewListProps<TEntry, TCompletionFactMarker>) {
  return (
    <div className="max-h-44 space-y-1 overflow-y-auto overflow-x-hidden text-xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {entries.length === 0 && completionFactMarkers.length === 0 ? (
        <p className="text-muted-foreground">No planned sessions.</p>
      ) : (
        <>
          {entries.map((entry) => {
            const visual = getGoalVisual({
              goalId: entry.originalGoalId,
              color: entry.activeGoal?.color ?? null,
            });
            const Icon = visual.Icon;
            const displayTitle = getEntryDisplayTitle(entry);
            const subtitle = getEntrySubtitle(entry);
            const credited = isEntryCredited(entry);
            const immovable = isEntryImmovableForDraft(entry);
            const completionToggleState = getCompletionToggleState(entry, day);
            return (
              <PlannerDraggablePreviewEntry
                key={`preview-entry-${entry.key}`}
                day={day}
                entryKey={entry.key}
                disabled={immovable}
              >
                {({
                  setNodeRef,
                  attributes,
                  listeners,
                  style,
                  isDragging,
                  isOver,
                }) => (
                  <div
                    ref={setNodeRef}
                    style={style}
                    className={`flex items-start gap-2 rounded border p-1.5 transition-colors ${
                      credited
                        ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-300 dark:bg-emerald-100 dark:text-emerald-950"
                        : ""
                    } ${
                      isOver
                        ? "border-primary/70 ring-1 ring-primary/60"
                        : "hover:border-primary/60"
                    } ${
                      immovable
                        ? "cursor-not-allowed"
                        : "cursor-grab active:cursor-grabbing"
                    } ${isDragging ? "opacity-70 ring-1 ring-primary/60" : ""}`}
                    title={
                      immovable
                        ? "Completed or historical sessions can't be moved in draft."
                        : "Click to view details or drag to move this session."
                    }
                    onPointerDownCapture={() => {
                      onEntryPointerStart(immovable);
                    }}
                    onPointerUpCapture={() => {
                      onEntryPointerEnd();
                    }}
                    onPointerCancelCapture={() => {
                      onEntryPointerEnd();
                    }}
                    {...attributes}
                    {...listeners}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      onClick={() => {
                        onEntryOpen(entry.key);
                      }}
                    >
                      <span
                        className="mt-0.5 inline-flex size-4 items-center justify-center rounded-full"
                        style={{ backgroundColor: visual.color }}
                      >
                        <Icon className="size-2.5 text-white" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{displayTitle}</p>
                        {subtitle ? (
                          <p className="truncate text-muted-foreground">{subtitle}</p>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="group mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-all hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleCompletion(entry, day);
                      }}
                      disabled={
                        mutationLoading ||
                        completionToggleState.disabledReasonCopy !== null
                      }
                      aria-label={
                        completionToggleState.currentlyCredited
                          ? "Mark session not done"
                          : "Mark session done"
                      }
                      title={
                        completionToggleState.disabledReasonCopy ??
                        "Toggle completion for this session"
                      }
                    >
                      {completionToggleState.currentlyCredited ? (
                        <CheckCircle2 className="size-3.5 text-primary transition-transform group-hover:scale-110" />
                      ) : (
                        <Circle className="size-3.5 text-muted-foreground transition-transform group-hover:scale-110" />
                      )}
                    </button>
                  </div>
                )}
              </PlannerDraggablePreviewEntry>
            );
          })}
          {completionFactMarkers.map((marker) => (
            <div
              key={`preview-completion-fact-${marker.key}`}
              className="rounded border border-emerald-300 bg-emerald-100 p-1.5 text-emerald-950 dark:border-emerald-300 dark:bg-emerald-100 dark:text-emerald-950"
            >
              <p className="truncate font-medium">{marker.goalTitle}</p>
              <p className="truncate text-[11px]">
                {marker.scheduledDate && marker.scheduledDate !== day
                  ? `Marked done here; credited from the ${marker.scheduledDate} scheduled session.`
                  : "Marked done on this date."}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

