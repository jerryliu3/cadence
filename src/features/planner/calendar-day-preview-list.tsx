"use client";

import { CompletionToggle } from "@/components/ui/completion-toggle";
import {
  PlannerDraggablePreviewEntry,
} from "@/features/planner/calendar-dnd";
import {
  getEntryDraftDiffSummary,
  getEntryDraftPillClasses,
} from "@/features/planner/calendar-format";
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
  onToggleCompletion: (
    entry: TEntry,
    day: string,
    sourceElement: HTMLButtonElement
  ) => void;
  onEntryPointerStart: (immovable: boolean) => void;
  onEntryPointerEnd: () => void;
  density?: "compact" | "expanded";
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
  density = "compact",
}: CalendarDayPreviewListProps<TEntry, TCompletionFactMarker>) {
  const expanded = density === "expanded";
  return (
    <div
      className={`space-y-1 overflow-y-auto overflow-x-hidden text-xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
        expanded ? "max-h-72" : "max-h-44"
      }`}
    >
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
            const draftDiffSummary = getEntryDraftDiffSummary(entry);
            const pillToneClasses = getEntryDraftPillClasses({
              draftDiffKind: entry.draftDiffKind,
              credited,
            });
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
                    className={`flex items-center gap-2 rounded-md border transition-colors ${pillToneClasses} ${
                      expanded ? "p-2" : "p-1.5"
                    } ${
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
                    {!entry.draftGhost ? (
                      <CompletionToggle
                        completed={completionToggleState.currentlyCredited}
                        pending={mutationLoading}
                        size="sm"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleCompletion(entry, day, event.currentTarget);
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
                      />
                    ) : null}
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => {
                        onEntryOpen(entry.key);
                      }}
                    >
                      <span
                        className="inline-flex size-4 items-center justify-center rounded-full"
                        style={{ backgroundColor: visual.color }}
                      >
                        <Icon className="size-2.5 text-white" />
                      </span>
                      <div className="min-w-0">
                        <p className={`${expanded ? "" : "truncate"} font-medium`}>
                          {displayTitle}
                        </p>
                        {draftDiffSummary ? (
                          <p
                            className={`${expanded ? "" : "truncate"} text-muted-foreground`}
                          >
                            {draftDiffSummary}
                          </p>
                        ) : null}
                        {subtitle ? (
                          <p
                            className={`${expanded ? "" : "truncate"} text-muted-foreground`}
                          >
                            {subtitle}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </div>
                )}
              </PlannerDraggablePreviewEntry>
            );
          })}
          {completionFactMarkers.map((marker) => (
            <div
              key={`preview-completion-fact-${marker.key}`}
              className={`rounded-md ${
                marker.owner === "partner"
                  ? "border-2 border-sky-500 bg-transparent text-sky-700 dark:text-sky-300"
                  : "border border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-300 dark:bg-emerald-100 dark:text-emerald-950"
              } ${expanded ? "p-2" : "p-1.5"}`}
              aria-label={`${marker.goalTitle}. ${
                marker.owner === "partner"
                  ? "Partner marked this done."
                  : marker.scheduledDate && marker.scheduledDate !== day
                    ? `Marked done here; credited from the ${marker.scheduledDate} scheduled session.`
                    : "Marked done."
              }`}
            >
              <p className="truncate font-medium">{marker.goalTitle}</p>
              <p className="truncate text-[11px]">
                {marker.owner === "partner"
                  ? "Partner marked this done."
                  : marker.scheduledDate && marker.scheduledDate !== day
                    ? `Marked done here; credited from the ${marker.scheduledDate} scheduled session.`
                    : "Marked done."}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

