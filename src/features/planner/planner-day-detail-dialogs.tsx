"use client";

import { format, parse } from "date-fns";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  completionDisabledReasonCopy,
  getEntryDraftDiffSummary,
  getEntrySubtitle,
} from "@/features/planner/calendar-format";
import type {
  CompletionControlDisabledReason,
  DraftItemEdit,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import type { PlannerEntryDateFactDispatch } from "@/features/planner/calendar-completion-selectors";
import {
  buildPlannerEntryRowState,
  PlannerEntryRow,
} from "@/features/planner/planner-entry-row";

interface PlannerDayDetailDialogsProps {
  dayDetailDay: string | null;
  selectedDayEntries: PlannerDayDetailEntry[];
  selectedEventEntry: PlannerDayDetailEntry | null;
  selectedEventDraftEdit: DraftItemEdit | undefined;
  selectedEventBaselineUnit: PlannerWorkUnit | null;
  mutationLoadingKey: string | null;
  canMutatePlanItems: boolean;
  closeDayDetails: () => void;
  closeEventDetails: () => void;
  selectEventEntry: (entryKey: string) => void;
  toggleDateFact: (entry: PlannerDayDetailEntry, selectedDateOverride?: string) => Promise<void>;
  toggleItemLock: (entry: PlannerDayDetailEntry) => Promise<void>;
  updateDraftLabel: (entry: PlannerDayDetailEntry, label: string) => void;
  updateDraftScheduledDate: (entry: PlannerDayDetailEntry, date: string) => void;
  updateDraftScheduledTimeOverride: (entry: PlannerDayDetailEntry, localTime: string) => void;
  getEntryDisplayTitleWithTime: (entry: PlannerDayDetailEntry) => string;
  getDateFactDispatchForEntry: (
    entry: PlannerDayDetailEntry,
    selectedDate?: string | null
  ) => PlannerEntryDateFactDispatch | null;
  completionControlDisabledReasonForEntry: (
    entry: PlannerDayDetailEntry,
    dispatch: PlannerEntryDateFactDispatch | null
  ) => CompletionControlDisabledReason | null;
}

export function PlannerDayDetailDialogs({
  dayDetailDay,
  selectedDayEntries,
  selectedEventEntry,
  selectedEventDraftEdit,
  selectedEventBaselineUnit,
  mutationLoadingKey,
  canMutatePlanItems,
  closeDayDetails,
  closeEventDetails,
  selectEventEntry,
  toggleDateFact,
  toggleItemLock,
  updateDraftLabel,
  updateDraftScheduledDate,
  updateDraftScheduledTimeOverride,
  getEntryDisplayTitleWithTime,
  getDateFactDispatchForEntry,
  completionControlDisabledReasonForEntry,
}: PlannerDayDetailDialogsProps) {
  const selectedEventCompletionDispatch = selectedEventEntry
    ? getDateFactDispatchForEntry(selectedEventEntry)
    : null;
  const selectedEventCompletionDisabledReason = selectedEventEntry
    ? completionControlDisabledReasonForEntry(
        selectedEventEntry,
        selectedEventCompletionDispatch
      )
    : null;

  return (
    <>
      <Dialog
        open={Boolean(dayDetailDay)}
        onOpenChange={(open) => {
          if (!open) {
            closeDayDetails();
          }
        }}
      >
        <DialogContent
          className="top-auto bottom-0 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl"
          aria-describedby="planner-day-detail-description"
        >
          <DialogHeader>
            <DialogTitle>
              {dayDetailDay
                ? format(
                    parse(dayDetailDay, "yyyy-MM-dd", new Date()),
                    "EEEE, MMMM d"
                  )
                : "Day detail"}
            </DialogTitle>
            <DialogDescription id="planner-day-detail-description">
              Review and update planned sessions for this date.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1" data-no-swipe="true">
            {selectedDayEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No planned sessions for this date.</p>
            ) : (
              <ul className="space-y-2">
                {selectedDayEntries.map((entry) => {
                  const displayTitle = getEntryDisplayTitleWithTime(entry);
                  const subtitle = getEntrySubtitle(entry);
                  const rowState = buildPlannerEntryRowState(entry);
                  const completionDispatch = getDateFactDispatchForEntry(entry);
                  const completionDisabledReason = completionControlDisabledReasonForEntry(
                    entry,
                    completionDispatch
                  );
                  return (
                    <li
                      key={entry.key}
                      className={`rounded-xl border p-2 ${rowState.pillToneClasses} ${
                        entry.draftGhost ? "opacity-75" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          className="flex-1 text-left text-sm transition-colors hover:text-primary"
                          onClick={() => {
                            if (!entry.draftGhost) {
                              selectEventEntry(entry.key);
                            }
                          }}
                        >
                          <PlannerEntryRow
                            entry={entry}
                            rowState={rowState}
                            displayTitle={displayTitle}
                            subtitle={subtitle}
                            variant="detail"
                            detailHintText={
                              entry.draftGhost
                                ? "Original date marker"
                                : "View event details"
                            }
                          />
                        </button>
                        {!entry.draftGhost ? (
                          <button
                            type="button"
                            className="group flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-all hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggleDateFact(entry);
                            }}
                            disabled={
                              Boolean(mutationLoadingKey) ||
                              completionDisabledReason !== null
                            }
                            aria-label={
                              completionDispatch?.currentlyCredited
                                ? "Mark session not done"
                                : "Mark session done"
                            }
                            title={
                              completionDisabledReason
                                ? completionDisabledReasonCopy(completionDisabledReason)
                                : "Toggle completion for this session"
                            }
                          >
                            {completionDispatch?.currentlyCredited ? (
                              <CheckCircle2 className="size-4 text-primary transition-transform group-hover:scale-110" />
                            ) : (
                              <Circle className="size-4 text-muted-foreground transition-transform group-hover:scale-110" />
                            )}
                          </button>
                        ) : null}
                      </div>
                      {completionDisabledReason ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {completionDisabledReasonCopy(completionDisabledReason)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedEventEntry)}
        onOpenChange={(open) => {
          if (!open) {
            closeEventDetails();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedEventEntry
                ? getEntryDisplayTitleWithTime(selectedEventEntry)
                : "Event detail"}
            </DialogTitle>
          </DialogHeader>
          {selectedEventEntry ? (
            <div className="space-y-3 text-sm">
              {getEntryDraftDiffSummary(selectedEventEntry) ? (
                <p className="text-xs text-muted-foreground">
                  {getEntryDraftDiffSummary(selectedEventEntry)}
                </p>
              ) : null}
              {getEntrySubtitle(selectedEventEntry) ? (
                <p className="text-xs text-muted-foreground">
                  {getEntrySubtitle(selectedEventEntry)}
                </p>
              ) : null}
              {selectedEventEntry.draftGhost ? (
                <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  This marker shows where the session was originally scheduled
                  before your preview move. Edit the moved session on its new date
                  to change or undo the move.
                </div>
              ) : (
                <div className="space-y-2 rounded-md border border-dashed p-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Title
                    <Input
                      value={
                        selectedEventDraftEdit?.label ??
                        selectedEventEntry.goalTitle ??
                        selectedEventEntry.label ??
                        ""
                      }
                      onChange={(event) =>
                        updateDraftLabel(selectedEventEntry, event.target.value)
                      }
                      placeholder="Goal title"
                      className="h-8 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Move to
                    <Input
                      type="date"
                      value={
                        selectedEventDraftEdit?.scheduledDate ??
                        selectedEventEntry.activeItem?.scheduled_date ??
                        dayDetailDay ??
                        ""
                      }
                      onChange={(event) =>
                        updateDraftScheduledDate(selectedEventEntry, event.target.value)
                      }
                      className="h-8 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Time
                    <Input
                      type="time"
                      step={60}
                      value={
                        selectedEventDraftEdit?.scheduledTimeOverride === null
                          ? ""
                          : selectedEventDraftEdit?.scheduledTimeOverride ??
                            selectedEventBaselineUnit?.scheduledTimeOverride ??
                            ""
                      }
                      onChange={(event) =>
                        updateDraftScheduledTimeOverride(
                          selectedEventEntry,
                          event.target.value
                        )
                      }
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() =>
                        updateDraftScheduledTimeOverride(selectedEventEntry, "")
                      }
                    >
                      Clear
                    </Button>
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Drag month-cell session pills to move quickly, or use this
                    date/time editor as a keyboard-friendly fallback.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Effective local time:{" "}
                    {selectedEventEntry.effectiveScheduledLocalTime ??
                      selectedEventBaselineUnit?.effectiveScheduledLocalTime ??
                      "date only"}
                  </p>
                  {selectedEventEntry.activeItem ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleItemLock(selectedEventEntry)}
                        disabled={Boolean(mutationLoadingKey) || !canMutatePlanItems}
                      >
                        {mutationLoadingKey === `lock:${selectedEventEntry.activeItem.id}`
                          ? "Saving..."
                          : selectedEventEntry.activeItem.locked
                            ? "Unlock"
                            : "Lock"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => void toggleDateFact(selectedEventEntry)}
                        disabled={
                          Boolean(mutationLoadingKey) ||
                          selectedEventCompletionDisabledReason !== null
                        }
                      >
                        {mutationLoadingKey === `fact:${selectedEventEntry.key}`
                          ? "Saving..."
                          : selectedEventCompletionDispatch?.currentlyCredited
                            ? (
                                <>
                                  <CheckCircle2 className="size-4" />
                                  Undo done
                                </>
                              )
                            : (
                                <>
                                  <Circle className="size-4" />
                                  Mark done
                                </>
                              )}
                      </Button>
                    </div>
                  ) : null}
                  {selectedEventCompletionDisabledReason ? (
                    <p className="text-xs text-muted-foreground">
                      {completionDisabledReasonCopy(
                        selectedEventCompletionDisabledReason
                      )}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
