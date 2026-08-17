"use client";

import { format, parse } from "date-fns";
import { ArrowRightLeft, Maximize2 } from "lucide-react";
import type { MutableRefObject } from "react";
import { AnchoredPopupCard } from "@/components/ui/anchored-popup-card";
import { Button } from "@/components/ui/button";
import { PlannerDayEntriesPanel } from "@/features/planner/planner-day-entries-panel";
import type {
  DayPreviewState,
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";

interface PlannerDayPreviewPopoverProps {
  dayPreview: DayPreviewState;
  popupRef: MutableRefObject<HTMLDivElement | null>;
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
  onEntryOpen: (entryKey: string, day: string) => void;
  onToggleCompletion: (
    entry: PlannerDayDetailEntry,
    day: string,
    sourceElement?: HTMLButtonElement
  ) => void;
  onEntryPointerStart: (immovable: boolean) => void;
  onEntryPointerEnd: () => void;
  onMoveDay: (day: string) => void;
  onExpandDay: (day: string) => void;
  onClose: () => void;
  onPointerDownCapture: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function PlannerDayPreviewPopover({
  dayPreview,
  popupRef,
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
  onEntryOpen,
  onToggleCompletion,
  onEntryPointerStart,
  onEntryPointerEnd,
  onMoveDay,
  onExpandDay,
  onClose,
  onPointerDownCapture,
  onMouseEnter,
  onMouseLeave,
}: PlannerDayPreviewPopoverProps) {
  return (
    <AnchoredPopupCard
      popupRef={popupRef}
      position={dayPreview.position}
      onPointerDownCapture={onPointerDownCapture}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={format(parse(dayPreview.day, "yyyy-MM-dd", new Date()), "EEE, MMM d")}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              onMoveDay(dayPreview.day);
            }}
          >
            <ArrowRightLeft className="mr-1 size-3" />
            Move
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Expand day details"
            title="Expand day details"
            onClick={() => {
              onExpandDay(dayPreview.day);
            }}
          >
            <Maximize2 className="size-3.5" />
          </Button>
          {dayPreview.pinned ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onClose}
            >
              X
            </Button>
          ) : null}
        </>
      }
    >
      <PlannerDayEntriesPanel
        day={dayPreview.day}
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
          onEntryOpen(entryKey, dayPreview.day);
        }}
        onToggleCompletion={(entry, day, sourceElement) =>
          onToggleCompletion(entry, day, sourceElement)
        }
        onEntryPointerStart={onEntryPointerStart}
        onEntryPointerEnd={onEntryPointerEnd}
        density="compact"
      />
    </AnchoredPopupCard>
  );
}
