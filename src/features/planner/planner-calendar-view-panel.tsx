"use client";

import { format, parse } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
} from "lucide-react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { PlannerDndProvider, type PlannerDragTarget } from "@/features/planner/calendar-dnd";
import { CalendarDayPreviewList } from "@/features/planner/calendar-day-preview-list";
import type { PlannerEntryDateFactDispatch } from "@/features/planner/calendar-completion-selectors";
import type {
  CompletionControlDisabledReason,
  DayPreviewState,
  PlannerCalendarViewMode,
  PlannerCompletionFactMarker,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import {
  selectPlannerEntryCompletionToggleViewModel,
  type PlannerCalendarDayCellRenderModel,
} from "@/features/planner/calendar-view-model-selectors";

interface PlannerCalendarViewPanelProps {
  viewMode: PlannerCalendarViewMode;
  plannerViewModes: readonly {
    value: PlannerCalendarViewMode;
    label: string;
  }[];
  loading: boolean;
  viewHeading: string;
  viewHeadingControlWidth: string;
  previousWindowAriaLabel: string;
  nextWindowAriaLabel: string;
  moveViewWindow: (direction: -1 | 1) => void;
  canResetViewWindow: boolean;
  resetViewWindow: () => void;
  expandedMonthRows: boolean;
  setExpandedMonthRows: Dispatch<SetStateAction<boolean>>;
  setCalendarViewMode: (nextViewMode: PlannerCalendarViewMode) => void;
  viewDescription: string;
  getDragEntryLabel: (entryKey: string) => string;
  getDragDayLabel: (day: string) => string;
  renderEntryDragOverlay: (entryKey: string) => ReactNode;
  handleDndEntryDragStart: (entryKey: string) => void;
  handleDndEntryDragEnd: (
    entryKey: string,
    target: PlannerDragTarget
  ) => void;
  handleDndEntryDragCancel: (entryKey: string | null) => void;
  focusedDay: string;
  focusedDayEntries: PlannerDayDetailEntry[];
  focusedDayCompletionFactMarkers: PlannerCompletionFactMarker[];
  previewDayEntries: PlannerDayDetailEntry[];
  previewDayCompletionFactMarkers: PlannerCompletionFactMarker[];
  mutationLoading: boolean;
  getEntryDisplayTitleWithTime: (entry: PlannerDayDetailEntry) => string;
  getEntrySubtitle: (entry: {
    goalTitle: string | null;
    label: string | null;
  }) => string | null;
  isEntryCredited: (entry: PlannerDayDetailEntry) => boolean;
  canMutateEntryOnDay: (
    entry: PlannerDayDetailEntry,
    day: string | null
  ) => boolean;
  isEntryImmovableForDraft: (entry: PlannerDayDetailEntry) => boolean;
  readOnlyMonthHint: string;
  getDateFactDispatchForEntry: (
    entry: PlannerDayDetailEntry,
    selectedDate?: string | null
  ) => PlannerEntryDateFactDispatch | null;
  completionControlDisabledReasonForEntry: (
    entry: PlannerDayDetailEntry,
    dispatch: PlannerEntryDateFactDispatch | null
  ) => CompletionControlDisabledReason | null;
  openDayDetails: (day: string) => void;
  toggleDateFact: (
    entry: PlannerDayDetailEntry,
    selectedDateOverride?: string
  ) => Promise<void>;
  suppressHoverForDrag: (options?: { clearPreview?: boolean }) => void;
  releaseHoverSuppression: () => void;
  weekdayLabels: string[];
  calendarGridDayCellModels: PlannerCalendarDayCellRenderModel[];
  renderCalendarDayCell: (cellModel: PlannerCalendarDayCellRenderModel) => ReactNode;
  draftSaveBlockedMessage: string | null;
  dayPreview: DayPreviewState | null;
  dayPreviewRef: RefObject<HTMLDivElement | null>;
  pinDayPreview: () => void;
  handleDayPreviewMouseEnter: () => void;
  handleDayPreviewMouseLeave: (day: string) => void;
  clearDayPreview: () => void;
  onSelectedDayChange: (
    day: string | null,
    mode: "push" | "replace",
    nextViewMode?: PlannerCalendarViewMode
  ) => void;
}

export function PlannerCalendarViewPanel({
  viewMode,
  plannerViewModes,
  loading,
  viewHeading,
  viewHeadingControlWidth,
  previousWindowAriaLabel,
  nextWindowAriaLabel,
  moveViewWindow,
  canResetViewWindow,
  resetViewWindow,
  expandedMonthRows,
  setExpandedMonthRows,
  setCalendarViewMode,
  viewDescription,
  getDragEntryLabel,
  getDragDayLabel,
  renderEntryDragOverlay,
  handleDndEntryDragStart,
  handleDndEntryDragEnd,
  handleDndEntryDragCancel,
  focusedDay,
  focusedDayEntries,
  focusedDayCompletionFactMarkers,
  previewDayEntries,
  previewDayCompletionFactMarkers,
  mutationLoading,
  getEntryDisplayTitleWithTime,
  getEntrySubtitle,
  isEntryCredited,
  canMutateEntryOnDay,
  isEntryImmovableForDraft,
  readOnlyMonthHint,
  getDateFactDispatchForEntry,
  completionControlDisabledReasonForEntry,
  openDayDetails,
  toggleDateFact,
  suppressHoverForDrag,
  releaseHoverSuppression,
  weekdayLabels,
  calendarGridDayCellModels,
  renderCalendarDayCell,
  draftSaveBlockedMessage,
  dayPreview,
  dayPreviewRef,
  pinDayPreview,
  handleDayPreviewMouseEnter,
  handleDayPreviewMouseLeave,
  clearDayPreview,
  onSelectedDayChange,
}: PlannerCalendarViewPanelProps) {
  const focusedDayLabel = format(parse(focusedDay, "yyyy-MM-dd", new Date()), "EEE MMM d");
  const dayPreviewHeading = dayPreview
    ? format(parse(dayPreview.day, "yyyy-MM-dd", new Date()), "EEEE, MMM d")
    : null;
  const getCompletionToggleState = (
    entry: PlannerDayDetailEntry,
    day: string
  ) =>
    selectPlannerEntryCompletionToggleViewModel({
      entry,
      day,
      canMutateEntryOnDay,
      isEntryCredited,
      readOnlyMonthHint,
      getDateFactDispatchForEntry,
      completionControlDisabledReasonForEntry,
    });
  const openFocusedDayEntry = (entryKey: string) => {
    const entry = focusedDayEntries.find((candidate) => candidate.key === entryKey);
    if (!entry || !canMutateEntryOnDay(entry, focusedDay)) {
      return;
    }
    openDayDetails(focusedDay);
  };
  const openPreviewDayEntry = (entryKey: string) => {
    if (!dayPreview) {
      return;
    }
    const entry = previewDayEntries.find((candidate) => candidate.key === entryKey);
    if (!entry || !canMutateEntryOnDay(entry, dayPreview.day)) {
      return;
    }
    openDayDetails(dayPreview.day);
  };
  const toggleCompletionIfMutable = (
    entry: PlannerDayDetailEntry,
    day: string
  ) => {
    if (!canMutateEntryOnDay(entry, day)) {
      return;
    }
    void toggleDateFact(entry, day);
  };
  /**
   * Day view and the hover popup render the same list with the same wiring; only
   * the day, its contents, and the open handler differ.
   */
  const renderDayEntryList = ({
    day,
    entries,
    completionFactMarkers,
    onEntryOpen,
  }: {
    day: string;
    entries: PlannerDayDetailEntry[];
    completionFactMarkers: PlannerCompletionFactMarker[];
    onEntryOpen: (entryKey: string) => void;
  }) => (
    <CalendarDayPreviewList
      day={day}
      entries={entries}
      completionFactMarkers={completionFactMarkers}
      mutationLoading={mutationLoading}
      getEntryDisplayTitle={getEntryDisplayTitleWithTime}
      getEntrySubtitle={getEntrySubtitle}
      isEntryCredited={isEntryCredited}
      isEntryImmovableForDraft={(entry) =>
        !canMutateEntryOnDay(entry, day) || isEntryImmovableForDraft(entry)
      }
      getCompletionToggleState={getCompletionToggleState}
      onEntryOpen={onEntryOpen}
      onToggleCompletion={toggleCompletionIfMutable}
      onEntryPointerStart={(immovable) => {
        void immovable;
        suppressHoverForDrag();
      }}
      onEntryPointerEnd={releaseHoverSuppression}
    />
  );

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className={`grid max-w-full items-center gap-2 ${
              viewMode === "month"
                ? "grid-cols-[2rem_minmax(0,1fr)_2rem_2rem_2rem]"
                : "grid-cols-[2rem_minmax(0,1fr)_2rem_2rem]"
            }`}
            style={{ width: viewHeadingControlWidth }}
          >
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={loading}
              aria-label={previousWindowAriaLabel}
              onClick={() => moveViewWindow(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <h3 className="truncate text-center text-base font-semibold">{viewHeading}</h3>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={loading}
              aria-label={nextWindowAriaLabel}
              onClick={() => moveViewWindow(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={loading || !canResetViewWindow}
              aria-label="Go to today"
              title="Go to today"
              onClick={resetViewWindow}
            >
              <RotateCcw className="size-4" />
            </Button>
            {viewMode === "month" ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={loading}
                aria-label={expandedMonthRows ? "Compact rows" : "Expand rows"}
                title={expandedMonthRows ? "Compact rows" : "Expand rows"}
                onClick={() => setExpandedMonthRows((current) => !current)}
              >
                {expandedMonthRows ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-1 rounded-md border p-1">
            {plannerViewModes.map((modeOption) => (
              <Button
                key={modeOption.value}
                type="button"
                size="sm"
                variant={viewMode === modeOption.value ? "default" : "ghost"}
                className="h-7 px-2 text-xs"
                disabled={loading}
                onClick={() => setCalendarViewMode(modeOption.value)}
              >
                {modeOption.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <p>{viewDescription}</p>
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Updating...
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <PlannerDndProvider
        getEntryLabel={getDragEntryLabel}
        getDayLabel={getDragDayLabel}
        renderDragOverlay={renderEntryDragOverlay}
        onEntryDragStart={handleDndEntryDragStart}
        onEntryDragEnd={handleDndEntryDragEnd}
        onEntryDragCancel={handleDndEntryDragCancel}
      >
        <div
          className={`transition-opacity duration-150 motion-reduce:transition-none ${
            loading ? "opacity-70" : "opacity-100"
          }`}
        >
          {viewMode === "day" ? (
            <div className="space-y-2" data-no-swipe="true">
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">{focusedDayLabel}</p>
                {renderDayEntryList({
                  day: focusedDay,
                  entries: focusedDayEntries,
                  completionFactMarkers: focusedDayCompletionFactMarkers,
                  onEntryOpen: openFocusedDayEntry,
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
                {weekdayLabels.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-2" data-no-swipe="true">
                {calendarGridDayCellModels.map(renderCalendarDayCell)}
              </div>
            </>
          )}
          {draftSaveBlockedMessage ? (
            <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs">
              <p className="font-medium">Preview save is currently blocked.</p>
              <p className="mt-1 text-muted-foreground">{draftSaveBlockedMessage}</p>
            </div>
          ) : null}

          {viewMode !== "day" && dayPreview ? (
            <div
              ref={dayPreviewRef}
              className="fixed z-40 rounded-lg border bg-card p-3 shadow-lg"
              style={{
                top: dayPreview.position.top,
                left: dayPreview.position.left,
                width: dayPreview.position.width,
                transform:
                  dayPreview.position.placement === "above"
                    ? "translateY(-100%)"
                    : undefined,
              }}
              onPointerDownCapture={() => {
                pinDayPreview();
              }}
              onMouseEnter={() => {
                handleDayPreviewMouseEnter();
              }}
              onMouseLeave={() => {
                handleDayPreviewMouseLeave(dayPreview.day);
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{dayPreviewHeading}</p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      clearDayPreview();
                      onSelectedDayChange(dayPreview.day, "push", "day");
                    }}
                  >
                    Day view
                  </Button>
                  {dayPreview.pinned ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={clearDayPreview}
                    >
                      X
                    </Button>
                  ) : null}
                </div>
              </div>
              {renderDayEntryList({
                day: dayPreview.day,
                entries: previewDayEntries,
                completionFactMarkers: previewDayCompletionFactMarkers,
                onEntryOpen: openPreviewDayEntry,
              })}
            </div>
          ) : null}
        </div>
      </PlannerDndProvider>
    </div>
  );
}
