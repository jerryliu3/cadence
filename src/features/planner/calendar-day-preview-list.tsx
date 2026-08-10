"use client";

import { CheckCircle2, Circle } from "lucide-react";
import {
  PlannerDraggablePreviewEntry,
} from "@/features/planner/calendar-dnd";
import { getCompletionFactMarkerHint } from "@/features/planner/calendar-format";
import {
  type CalendarCompletionFactMarkerBase,
  type CalendarMonthCellEntryBase,
} from "@/features/planner/calendar-month-day-cell";
import {
  buildPlannerEntryRowState,
  PlannerEntryRow,
} from "@/features/planner/planner-entry-row";

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
            const credited = isEntryCredited(entry);
            const rowState = buildPlannerEntryRowState(entry, {
              creditedOverride: credited,
            });
            const displayTitle = getEntryDisplayTitle(entry);
            const subtitle = getEntrySubtitle(entry);
            const immovable = isEntryImmovableForDraft(entry);
            const draftDiffSummary = rowState.draftDiffSummary;
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
                    className={`flex items-start gap-2 rounded-lg border p-1.5 transition-colors ${rowState.pillToneClasses} ${
                      entry.draftGhost ? "opacity-75" : ""
                    } ${
                      isOver
                        ? "border-primary/70 ring-1 ring-primary/60"
                        : "hover:border-primary/60"
                    } ${
                      immovable
                        ? "cursor-not-allowed"
                        : "cursor-grab active:cursor-grabbing"
                    } ${isDragging ? "pointer-events-none opacity-0" : ""}`}
                    title={
                      `${draftDiffSummary ? `${draftDiffSummary} ` : ""}${
                        immovable
                          ? "Completed or historical sessions can't be moved in draft."
                          : "Click to view details or drag to move this session."
                      }`
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
                      <PlannerEntryRow
                        entry={entry}
                        rowState={rowState}
                        displayTitle={displayTitle}
                        subtitle={subtitle}
                        variant="preview"
                      />
                    </button>
                    {!entry.draftGhost ? (
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
                    ) : null}
                  </div>
                )}
              </PlannerDraggablePreviewEntry>
            );
          })}
          {completionFactMarkers.map((marker) => (
            <div
              key={`preview-completion-fact-${marker.key}`}
              className="rounded-lg border border-emerald-300 bg-emerald-100 p-1.5 text-emerald-950 dark:border-emerald-300 dark:bg-emerald-100 dark:text-emerald-950"
            >
              <p className="truncate font-medium">{marker.goalTitle}</p>
              <p className="truncate text-[11px]">
                {getCompletionFactMarkerHint(marker, day)}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

