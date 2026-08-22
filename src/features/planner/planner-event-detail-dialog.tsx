"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { getEntryDraftDiffSummary, getEntrySubtitle } from "@/features/planner/calendar-format";
import { LinkedTargetsNote } from "@/features/planner/linked-targets-note";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";

export interface PlannerEventDetailDialogCallbacks {
  onOpenChange: (open: boolean) => void;
  onUpdateDraftLabel: (entry: PlannerDayDetailEntry, nextLabel: string) => void;
  onUpdateDraftScheduledDate: (entry: PlannerDayDetailEntry, nextDate: string) => void;
  onUpdateDraftScheduledTimeOverride: (
    entry: PlannerDayDetailEntry,
    nextTime: string
  ) => void;
  onToggleItemLock: (entry: PlannerDayDetailEntry) => void;
  onNavigateToFirstOpenInstance: () => void;
  onNavigateToPreviousOpenInstance: () => void;
  onNavigateToNextOpenInstance: () => void;
  onNavigateToLastOpenInstance: () => void;
}

interface PlannerEventDetailDialogProps {
  selectedEventEntry: PlannerDayDetailEntry | null;
  selectedEventLinkedTargets: Array<{
    sourceGoalId: string;
    targetGoalId: string;
    targetSuppressionKind: "none" | "until" | "indefinite";
    targetResumesOn: string | null;
  }>;
  goalTitles: Record<string, string>;
  scopeMonth: string;
  selectedEventDraftEdit:
    | {
        label?: string | null;
        scheduledDate?: string | null;
        scheduledTimeOverride?: string | null;
      }
    | undefined;
  selectedEventBaselineUnit:
    | {
        effectiveScheduledLocalTime?: string | null;
        scheduledTimeOverride?: string | null;
      }
    | null;
  selectedEventDraftScheduledDate: string | null;
  selectedEventDraftTimeInputValue: string;
  mutationLoadingKey: string | null;
  canMutatePlanItems: boolean;
  canNavigateToFirstOpenInstance: boolean;
  canNavigateToPreviousOpenInstance: boolean;
  canNavigateToNextOpenInstance: boolean;
  canNavigateToLastOpenInstance: boolean;
  getEntryGoalFirstTitleWithTime: (entry: PlannerDayDetailEntry) => string;
  callbacks: PlannerEventDetailDialogCallbacks;
}

export function PlannerEventDetailDialog({
  selectedEventEntry,
  selectedEventLinkedTargets,
  goalTitles,
  scopeMonth,
  selectedEventDraftEdit,
  selectedEventBaselineUnit,
  selectedEventDraftScheduledDate,
  selectedEventDraftTimeInputValue,
  mutationLoadingKey,
  canMutatePlanItems,
  canNavigateToFirstOpenInstance,
  canNavigateToPreviousOpenInstance,
  canNavigateToNextOpenInstance,
  canNavigateToLastOpenInstance,
  getEntryGoalFirstTitleWithTime,
  callbacks,
}: PlannerEventDetailDialogProps) {
  const handleOpenAutoFocus = (event: Event) => {
    event.preventDefault();
  };

  return (
    <Dialog open={Boolean(selectedEventEntry)} onOpenChange={callbacks.onOpenChange}>
      <DialogContent
        className="overflow-x-hidden"
        onOpenAutoFocus={handleOpenAutoFocus}
      >
        <DialogHeader className="gap-1 pr-10">
          <div className="flex items-center justify-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Go to first open instance"
              onClick={callbacks.onNavigateToFirstOpenInstance}
              disabled={!canNavigateToFirstOpenInstance}
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Go to previous open instance"
              onClick={callbacks.onNavigateToPreviousOpenInstance}
              disabled={!canNavigateToPreviousOpenInstance}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <DialogTitle className="mx-1 min-w-0 text-center">
              {selectedEventEntry
                ? getEntryGoalFirstTitleWithTime(selectedEventEntry)
                : "Event detail"}
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Go to next open instance"
              onClick={callbacks.onNavigateToNextOpenInstance}
              disabled={!canNavigateToNextOpenInstance}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Go to last open instance"
              onClick={callbacks.onNavigateToLastOpenInstance}
              disabled={!canNavigateToLastOpenInstance}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </DialogHeader>
        {selectedEventEntry ? (
          <div className="min-w-0 space-y-3 text-sm">
            {selectedEventEntry.hasLinkedTargets ? (
              <LinkedTargetsNote
                linkedTargets={selectedEventLinkedTargets}
                goalTitles={goalTitles}
                scopeMonth={scopeMonth}
              />
            ) : null}
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
                This marker shows where the session was originally scheduled before your
                preview move. Edit the moved session on its new date to change or undo the
                move.
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
                      callbacks.onUpdateDraftLabel(selectedEventEntry, event.target.value)
                    }
                    placeholder="Goal title"
                    className="h-8 text-xs"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Date
                  <Input
                    type="date"
                    value={selectedEventDraftScheduledDate ?? ""}
                    onChange={(event) =>
                      callbacks.onUpdateDraftScheduledDate(
                        selectedEventEntry,
                        event.target.value
                      )
                    }
                    className="h-8 text-xs"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Time
                  <Input
                    type="time"
                    step={60}
                    value={selectedEventDraftTimeInputValue}
                    onChange={(event) =>
                      callbacks.onUpdateDraftScheduledTimeOverride(
                        selectedEventEntry,
                        event.target.value
                      )
                    }
                    className="h-8 text-xs"
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Drag month-cell session pills to move quickly, or use this date/time editor
                  as a keyboard-friendly fallback.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Effective local time:{" "}
                  {selectedEventEntry.effectiveScheduledLocalTime ??
                    selectedEventBaselineUnit?.effectiveScheduledLocalTime ??
                    "date only"}
                </p>
                {selectedEventEntry.activeItem ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link href={`/app/goals/${selectedEventEntry.originalGoalId}`}>
                        Edit goal
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => callbacks.onToggleItemLock(selectedEventEntry)}
                      disabled={Boolean(mutationLoadingKey) || !canMutatePlanItems}
                    >
                      {mutationLoadingKey === `lock:${selectedEventEntry.activeItem.id}`
                        ? "Saving..."
                        : selectedEventEntry.activeItem.locked
                          ? "Unlock"
                          : "Lock"}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
