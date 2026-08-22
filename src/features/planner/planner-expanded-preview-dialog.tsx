"use client";

import { format, parse } from "date-fns";
import { ArrowRightLeft, Minimize2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlannerDayEntriesPanel } from "@/features/planner/planner-day-entries-panel";
import type {
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";

interface PlannerExpandedPreviewDialogProps {
  expandedPreviewDay: string | null;
  entries: PlannerDayDetailEntry[];
  completionFactMarkers: PlannerCompletionFactMarker[];
  mutationLoading: boolean;
  asOfDate: string | null;
  canMutatePlanItems: boolean;
  canMutateEntryOnDay: (entry: PlannerDayDetailEntry, day: string | null) => boolean;
  getEntryDisplayTitle: (entry: PlannerDayDetailEntry) => string;
  getEntrySubtitle: (entry: PlannerDayDetailEntry) => string | null;
  isEntryCredited: (entry: PlannerDayDetailEntry) => boolean;
  isEntryImmovableForDraft: (entry: PlannerDayDetailEntry) => boolean;
  onOpenChange: (open: boolean) => void;
  addDisabled: boolean;
  onAddDay: (day: string) => void;
  onMoveDay: (day: string) => void;
  onContract: () => void;
  onEntryOpen: (entryKey: string, day: string) => void;
  onToggleCompletion: (
    entry: PlannerDayDetailEntry,
    day: string,
    sourceElement?: HTMLButtonElement
  ) => void;
  onEntryPointerStart: (immovable: boolean) => void;
  onEntryPointerEnd: () => void;
}

export function PlannerExpandedPreviewDialog({
  expandedPreviewDay,
  entries,
  completionFactMarkers,
  mutationLoading,
  asOfDate,
  canMutatePlanItems,
  canMutateEntryOnDay,
  getEntryDisplayTitle,
  getEntrySubtitle,
  isEntryCredited,
  isEntryImmovableForDraft,
  onOpenChange,
  addDisabled,
  onAddDay,
  onMoveDay,
  onContract,
  onEntryOpen,
  onToggleCompletion,
  onEntryPointerStart,
  onEntryPointerEnd,
}: PlannerExpandedPreviewDialogProps) {
  return (
    <Dialog open={Boolean(expandedPreviewDay)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {expandedPreviewDay ? (
          <div className="absolute top-2 right-10 z-10 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onAddDay(expandedPreviewDay);
              }}
              disabled={addDisabled}
            >
              <Plus className="size-4" />
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onMoveDay(expandedPreviewDay);
              }}
            >
              <ArrowRightLeft className="size-4" />
              Move
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Contract to day popup"
              title="Contract to day popup"
              onClick={onContract}
            >
              <Minimize2 className="size-4" />
            </Button>
          </div>
        ) : null}
        <DialogHeader>
          <DialogTitle>
            {expandedPreviewDay
              ? format(parse(expandedPreviewDay, "yyyy-MM-dd", new Date()), "EEE, MMM d")
              : "Expanded day preview"}
          </DialogTitle>
          <DialogDescription>
            Review all sessions for this day. Use Move to stage taking one existing
            scheduled session and relocating it to this date.
          </DialogDescription>
        </DialogHeader>
        {expandedPreviewDay ? (
          <div className="space-y-3">
            <PlannerDayEntriesPanel
              day={expandedPreviewDay}
              entries={entries}
              completionFactMarkers={completionFactMarkers}
              mutationLoading={mutationLoading}
              asOfDate={asOfDate}
              canMutatePlanItems={canMutatePlanItems}
              canMutateEntryOnDay={canMutateEntryOnDay}
              getEntryDisplayTitle={getEntryDisplayTitle}
              getEntrySubtitle={getEntrySubtitle}
              isEntryCredited={isEntryCredited}
              isEntryImmovableForDraft={isEntryImmovableForDraft}
              onEntryOpen={(entryKey) => {
                onEntryOpen(entryKey, expandedPreviewDay);
              }}
              onToggleCompletion={(entry, day, sourceElement) =>
                onToggleCompletion(entry, day, sourceElement)
              }
              onEntryPointerStart={onEntryPointerStart}
              onEntryPointerEnd={onEntryPointerEnd}
              density="expanded"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
