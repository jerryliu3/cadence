"use client";

import { addDays, addMonths, format } from "date-fns";
import {
  CalendarDays,
  Loader2,
  Settings,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useReducer,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildActiveGoalIndexes } from "@/features/planner/calendar-entries";
import {
  buildWeekdayLabels,
  getEntryDisplayTitle,
  getEntrySubtitle,
  isEntryCredited,
  isEntryImmovableForDraft,
  normalizeWeekStartsOn,
  parseMonth,
  resolveNonPublishablePreviewMessage,
} from "@/features/planner/calendar-format";
import {
  selectPlannerCalendarDayCellRenderModel,
  selectPlannerCalendarHeaderModel,
  selectPlannerCalendarSaveStateModel,
  selectPlannerCalendarViewModel,
  type PlannerCalendarDayCellRenderModel,
} from "@/features/planner/calendar-selectors";
import { PlannerCalendarViewPanel } from "@/features/planner/planner-calendar-view-panel";
import { CalendarMonthDayCell } from "@/features/planner/calendar-month-day-cell";
import { PlannerDayDetailDialogs } from "@/features/planner/planner-day-detail-dialogs";
import { PlannerPreferencesForm } from "@/features/planner/planner-preferences-form";
import { PlannerCoachPanel } from "@/features/planner/coach/planner-coach-panel";
import { usePlannerCoach } from "@/features/planner/coach/use-planner-coach";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";
import {
  draftCommandReducer,
  initialDraftCommandState,
} from "@/features/planner/draft-command-reducer";
import { useCalendarDayPreview } from "@/features/planner/use-calendar-day-preview";
import { usePlannerDayDetailSelectionState } from "@/features/planner/use-planner-day-detail-selection-state";
import { usePlannerDraftEntryActions } from "@/features/planner/use-planner-draft-entry-actions";
import { usePlannerCompletionActions } from "@/features/planner/use-planner-completion-actions";
import { usePlannerDraftLifecycleActions } from "@/features/planner/use-planner-draft-lifecycle-actions";
import { usePlannerContextSetup } from "@/features/planner/use-planner-context-setup";
import { usePlannerDraftPreviewSession } from "@/features/planner/use-planner-draft-preview-session";
import { usePlannerEntryDnd } from "@/features/planner/use-planner-entry-dnd";
import {
  readPlannerCalendarDayProjection,
  selectPlannerCalendarDayProjectionsByDay,
  selectPlannerCalendarStoreProjection,
} from "@/features/planner/calendar-store-selectors";
import { selectCalendarViewWindowProjection } from "@/features/planner/calendar-view-projection";
import { getDateInTimezone } from "@/lib/dates/timezone";
import { type PlannerPolicy } from "@/lib/planner/policy";
import type {
  CalendarSurfaceProps,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import { usePlannerVisibleMonthContexts } from "@/features/planner/use-planner-visible-month-contexts";
const DAY_PREVIEW_HOVER_DELAY_MS = 500;
const DAY_PREVIEW_CLOSE_DELAY_MS = 180;
const DAY_PREVIEW_LONG_PRESS_DELAY_MS = 500;
const DRAFT_MOVE_PREVIEW_REFRESH_DELAY_MS = 200;

const PLANNER_VIEW_MODES = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
] as const;

export function CalendarSurface({
  activeTab,
  month,
  selectedDay,
  viewMode,
  onMonthChange,
  onViewModeChange,
  onSelectedDayChange,
  onPlannerMutation,
}: CalendarSurfaceProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftPolicyByScope, setDraftPolicyByScope] = useState<
    Record<string, PlannerPolicy>
  >({});
  const [draftPreviewByScope, setDraftPreviewByScope] = useState<
    Record<string, NonNullable<PlannerContextPayload["preview"]>>
  >({});
  const [draftCommandState, dispatchDraftCommand] = useReducer(
    draftCommandReducer,
    initialDraftCommandState
  );
  const [expandedMonthRows, setExpandedMonthRows] = useState(false);
  const [previewEntryOrderByDay, setPreviewEntryOrderByDay] = useState<
    Record<string, string[]>
  >({});
  const {
    dayPreview,
    dayPreviewRef,
    clearDayPreview,
    prepareForDayDetailOpen,
    pinDayPreview,
    suppressHoverForDrag,
    releaseHoverSuppression,
    handleDayCellClick,
    handleDayCellMouseEnter,
    handleDayCellMouseLeave,
    handleDayCellPointerDown,
    handleDayCellPointerEnd,
    handleDayCellPointerLeave,
    handleDayPreviewMouseEnter,
    handleDayPreviewMouseLeave,
  } = useCalendarDayPreview({
    hoverDelayMs: DAY_PREVIEW_HOVER_DELAY_MS,
    closeDelayMs: DAY_PREVIEW_CLOSE_DELAY_MS,
    longPressDelayMs: DAY_PREVIEW_LONG_PRESS_DELAY_MS,
  });
  const {
    dayDetailDay,
    selectedEventEntryKey,
    setDayDetailDay,
    closeDayDetails,
    closeEventDetails,
    selectEventEntry,
  } = usePlannerDayDetailSelectionState();
  const handleSetupApplied = useCallback(() => {
    setDraftPolicyByScope({});
    setDraftPreviewByScope({});
    dispatchDraftCommand({ type: "clear" });
    setSettingsOpen(false);
  }, []);
  const {
    context,
    loading,
    setupLoading,
    error,
    setupTimezone,
    setSetupTimezone,
    setupWeekStartsOn,
    setSetupWeekStartsOn,
    setupRestWeekdays,
    setSetupRestWeekdays,
    timezoneOptions,
    loadContext,
    submitSetup,
  } = usePlannerContextSetup({
    activeTab,
    month,
    onMonthChange,
    onPlannerMutation,
    onSetupApplied: handleSetupApplied,
  });

  const weekStartsOn = normalizeWeekStartsOn(
    context?.preferences?.defaultPolicy.weekStartsOn
  );
  const calendarToday =
    context?.asOfDate ??
    getDateInTimezone(new Date(), context?.timezone ?? setupTimezone);
  const { cells, focusedDay, focusedWeekDays, focusedWeekCells, visibleDays } =
    useMemo(
      () =>
        selectCalendarViewWindowProjection({
          month,
          selectedDay,
          calendarToday,
          weekStartsOn,
          viewMode,
        }),
      [calendarToday, month, selectedDay, viewMode, weekStartsOn]
    );
  const weekdayLabels = useMemo(
    () => buildWeekdayLabels(weekStartsOn),
    [weekStartsOn]
  );
  const visibleMonthContexts = usePlannerVisibleMonthContexts({
    activeTab,
    scopeMonth: month,
    visibleDays,
  });
  const currentScopeMonth = month ?? context?.scopeMonth ?? null;
  const setDraftPolicyForScope = useCallback(
    (scopeMonth: string, policy: PlannerPolicy | null) => {
      setDraftPolicyByScope((previous) => {
        if (policy === null) {
          if (!(scopeMonth in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[scopeMonth];
          return next;
        }
        if (previous[scopeMonth] === policy) {
          return previous;
        }
        return {
          ...previous,
          [scopeMonth]: policy,
        };
      });
    },
    []
  );
  const setDraftPreviewForScope = useCallback(
    (
      scopeMonth: string,
      preview: NonNullable<PlannerContextPayload["preview"]> | null
    ) => {
      setDraftPreviewByScope((previous) => {
        if (preview === null) {
          if (!(scopeMonth in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[scopeMonth];
          return next;
        }
        return {
          ...previous,
          [scopeMonth]: preview,
        };
      });
    },
    []
  );
  const clearDraftScopeSession = useCallback(
    (scopeMonth: string) => {
      setDraftPolicyForScope(scopeMonth, null);
      setDraftPreviewForScope(scopeMonth, null);
      dispatchDraftCommand({
        type: "remove_scope",
        scopeMonth,
      });
    },
    [setDraftPolicyForScope, setDraftPreviewForScope]
  );
  const effectiveDraftPolicy = currentScopeMonth
    ? draftPolicyByScope[currentScopeMonth] ?? null
    : null;
  const effectiveDraftPreview = currentScopeMonth
    ? draftPreviewByScope[currentScopeMonth] ?? null
    : null;
  const effectivePreview = effectiveDraftPreview ?? context?.preview ?? null;
  const dirtyScopeMonths = useMemo(() => {
    const scopeSet = new Set<string>();
    for (const [scopeMonth, draftPolicy] of Object.entries(draftPolicyByScope)) {
      if (draftPolicy) {
        scopeSet.add(scopeMonth);
      }
    }
    for (const scopedCommand of draftCommandState.commands) {
      scopeSet.add(scopedCommand.scopeMonth);
    }
    return Array.from(scopeSet).sort((left, right) => left.localeCompare(right));
  }, [draftCommandState.commands, draftPolicyByScope]);
  const currentScopeHasDraftSession = currentScopeMonth
    ? dirtyScopeMonths.includes(currentScopeMonth)
    : false;
  const hasDraftSession = dirtyScopeMonths.length > 0;
  const { horizonCounter, eligibilityNotices } = useMemo(
    () =>
      selectPlannerCalendarHeaderModel({
        preview: effectivePreview,
        goalTitles: context?.goalTitles,
      }),
    [context?.goalTitles, effectivePreview]
  );
  const activeGoalIndexes = useMemo(
    () => buildActiveGoalIndexes(context?.activePlan?.goals),
    [context?.activePlan?.goals]
  );
  const activeGoalsByPlanGoalId = activeGoalIndexes.byPlanGoalId;
  const activeGoalsByOriginalGoalId = activeGoalIndexes.byOriginalGoalId;
  const calendarStoreProjection = useMemo(
    () =>
      selectPlannerCalendarStoreProjection({
        context,
        effectivePreview,
        currentScopeMonth,
        draftCommandState,
        visibleMonthContexts,
        activeGoalsByPlanGoalId,
        activeGoalsByOriginalGoalId,
      }),
    [
      activeGoalsByOriginalGoalId,
      activeGoalsByPlanGoalId,
      context,
      currentScopeMonth,
      draftCommandState,
      effectivePreview,
      visibleMonthContexts,
    ]
  );
  const {
    effectiveDraftCommands,
    effectiveDraftItemEdits,
    entriesByDate,
    entryByKey,
    entryDayByKey,
    previewUnitByEntryKey,
    completionFactUnitsByGoalDate,
  } = calendarStoreProjection;
  const dayPreviewDay = dayPreview?.day ?? null;
  const projectionDays = useMemo(() => {
    const days = new Set<string>();
    for (const day of visibleDays) {
      days.add(day);
    }
    if (dayDetailDay) {
      days.add(dayDetailDay);
    }
    if (focusedDay) {
      days.add(focusedDay);
    }
    if (dayPreviewDay) {
      days.add(dayPreviewDay);
    }
    return Array.from(days);
  }, [dayDetailDay, dayPreviewDay, focusedDay, visibleDays]);
  const dayProjectionByDay = useMemo(
    () =>
      selectPlannerCalendarDayProjectionsByDay({
        days: projectionDays,
        storeProjection: calendarStoreProjection,
        previewEntryOrderByDay,
      }),
    [calendarStoreProjection, previewEntryOrderByDay, projectionDays]
  );
  const getCalendarDayProjection = useCallback(
    (day: string | null) => readPlannerCalendarDayProjection(dayProjectionByDay, day),
    [dayProjectionByDay]
  );

  const isDayInCurrentScopeMonth = useCallback(
    (day: string | null) => {
      if (!day || !month) {
        return false;
      }
      return day.slice(0, 7) === month;
    },
    [month]
  );
  const canMutateEntryOnDay = useCallback(
    (entry: PlannerDayDetailEntry, day: string | null) => {
      if (!day) {
        return false;
      }
      if (isDayInCurrentScopeMonth(day)) {
        return true;
      }
      return entryDayByKey.get(entry.key) === day;
    },
    [entryDayByKey, isDayInCurrentScopeMonth]
  );
  const getCompletionFactMarkersForDay = useCallback(
    (day: string | null) => getCalendarDayProjection(day).completionFactMarkers,
    [getCalendarDayProjection]
  );
  const getOrderedEntriesForDay = useCallback(
    (day: string | null) => getCalendarDayProjection(day).orderedEntries,
    [getCalendarDayProjection]
  );

  const selectedDayEntries = useMemo(() => {
    return getOrderedEntriesForDay(dayDetailDay);
  }, [dayDetailDay, getOrderedEntriesForDay]);
  const focusedDayEntries = useMemo(
    () => getOrderedEntriesForDay(focusedDay),
    [focusedDay, getOrderedEntriesForDay]
  );
  const focusedDayCompletionFactMarkers = useMemo(
    () => getCompletionFactMarkersForDay(focusedDay),
    [focusedDay, getCompletionFactMarkersForDay]
  );
  const selectedEventEntry = useMemo(
    () =>
      selectedEventEntryKey
        ? entryByKey.get(selectedEventEntryKey) ?? null
        : null,
    [entryByKey, selectedEventEntryKey]
  );
  const selectedEventDraftEdit = selectedEventEntry
    ? effectiveDraftItemEdits[selectedEventEntry.key]
    : undefined;
  const selectedEventBaselineUnit = selectedEventEntry
    ? previewUnitByEntryKey.get(selectedEventEntry.key) ?? null
    : null;
  const getEntryDisplayTitleWithTime = useCallback(
    (entry: PlannerDayDetailEntry) => {
      const baseTitle = getEntryDisplayTitle(entry);
      return entry.effectiveScheduledLocalTime
        ? `${entry.effectiveScheduledLocalTime} ${baseTitle}`
        : baseTitle;
    },
    []
  );

  const previewDayEntries = useMemo(
    () => getOrderedEntriesForDay(dayPreview?.day ?? null),
    [dayPreview?.day, getOrderedEntriesForDay]
  );
  const previewDayCompletionFactMarkers = useMemo(
    () => getCompletionFactMarkersForDay(dayPreview?.day ?? null),
    [dayPreview?.day, getCompletionFactMarkersForDay]
  );

  const {
    draftSaveCommands,
    refreshDraftPreview,
    applyPolicyReplanMoves,
    clearDraftMoveCommands,
    scheduleDraftMovePreviewRefresh,
  } = usePlannerDraftPreviewSession({
    context,
    effectivePreview,
    effectiveDraftPolicy,
    effectiveDraftCommands,
    draftCommandState,
    dispatchDraftCommand,
    setDraftPreviewForScope,
    draftMovePreviewRefreshDelayMs: DRAFT_MOVE_PREVIEW_REFRESH_DELAY_MS,
  });

  const getNonPublishablePreviewMessage = useCallback(
    (preview: NonNullable<PlannerContextPayload["preview"]>) =>
      resolveNonPublishablePreviewMessage(context, preview),
    [context]
  );
  const runCompletionMutation = useCompletionMutation();
  const coach = usePlannerCoach({
    activeTab,
    context,
    entriesByDate,
    effectivePreview,
    effectiveDraftPolicy,
    hasDraftSession,
    refreshDraftPreview,
    applyPolicyReplanMoves,
    clearDraftMoveCommands,
    applyDraftPolicy: (scopeMonth, policy) => {
      setDraftPolicyForScope(scopeMonth, policy);
    },
    getNonPublishablePreviewMessage,
  });

  const {
    queueDraftMoveCommand,
    updateDraftLabel,
    updateDraftScheduledTimeOverride,
    updateDraftScheduledDate,
  } = usePlannerDraftEntryActions({
    context,
    entriesByDate,
    previewUnitByEntryKey,
    completionFactUnitsByGoalDate,
    dispatchDraftCommand,
    scheduleDraftMovePreviewRefresh,
  });

  const {
    draggingEntryKey,
    getDragEntryLabel,
    getDragDayLabel,
    renderEntryDragOverlay,
    handleDndEntryDragStart,
    handleDndEntryDragEnd,
    handleDndEntryDragCancel,
  } = usePlannerEntryDnd({
    entryByKey,
    entryDayByKey,
    entriesByDate,
    getEntryDisplayTitle: getEntryDisplayTitleWithTime,
    queueDraftMoveCommand,
    suppressHoverForDrag,
    releaseHoverSuppression,
    setPreviewEntryOrderByDay,
  });
  const {
    mutationLoadingKey,
    canMutatePlanItems,
    getDateFactDispatchForEntry,
    completionControlDisabledReasonForEntry,
    toggleItemLock,
    toggleDateFact,
  } = usePlannerCompletionActions({
    context,
    dayDetailDay,
    hasDraftSession,
    effectiveDraftItemEdits,
    effectiveDraftPolicy,
    refreshDraftPreview,
    loadContext,
    onPlannerMutation,
    runCompletionMutation,
  });
  const { saveLoading, resetLoading, savePlan, resetPlan, discardDraftChanges } =
    usePlannerDraftLifecycleActions({
      context,
      effectivePreview,
      effectiveDraftPolicy,
      draftSaveCommands,
      clearDraftScopeSession,
      dispatchDraftCommand,
      loadContext,
      onPlannerMutation,
      onPlannerStateReset: coach.actions?.resetForPlannerStateReset ?? (() => {}),
      onDraftDiscarded: coach.actions?.onDraftDiscarded ?? (() => {}),
    });

  const canShowSetup = !context?.preferences;
  const showBlockingLoading = loading && context === null;
  const plannerCalendarViewModel = useMemo(
    () =>
      selectPlannerCalendarViewModel({
        month,
        viewMode,
        focusedDay,
        focusedWeekDays,
        calendarToday,
        weekStartsOn,
        timezone: context?.timezone ?? setupTimezone,
      }),
    [
      calendarToday,
      context?.timezone,
      focusedDay,
      focusedWeekDays,
      month,
      setupTimezone,
      viewMode,
      weekStartsOn,
    ]
  );
  const { todayMonth, safeFocusedDay } = plannerCalendarViewModel;
  const moveViewWindow = (direction: -1 | 1) => {
    if (viewMode === "month") {
      if (!month) {
        return;
      }
      onMonthChange(
        format(addMonths(parseMonth(month), direction), "yyyy-MM"),
        "push"
      );
      return;
    }
    const stepDays = viewMode === "week" ? 7 : 1;
    const nextDay = format(addDays(safeFocusedDay, direction * stepDays), "yyyy-MM-dd");
    onSelectedDayChange(nextDay, "push", viewMode);
  };
  const resetViewWindow = () => {
    if (viewMode === "month") {
      onMonthChange(todayMonth, "replace");
      return;
    }
    onSelectedDayChange(calendarToday, "replace", viewMode);
  };
  const setCalendarViewMode = (nextViewMode: (typeof PLANNER_VIEW_MODES)[number]["value"]) => {
    if (nextViewMode === viewMode) {
      return;
    }
    clearDayPreview();
    onViewModeChange(nextViewMode, "push");
  };
  const plannerCalendarSaveStateModel = selectPlannerCalendarSaveStateModel({
    context,
    effectivePreview,
    hasDraftSession,
    saveLoading,
    dirtyScopeMonths,
    draftPreviewByScope,
    visibleMonthContexts,
  });
  const {
    scopeMonthsForSaveAction,
    draftSaveBlocked,
    draftSaveBlockedMessage,
    canResetPlan,
    canShowSaveAction,
    saveButtonLabel,
  } = plannerCalendarSaveStateModel;
  const openDayDetails = (day: string) => {
    prepareForDayDetailOpen();
    setDayDetailDay(day);
  };
  const discardDraftChangesForMode = (mode: "current" | "all") => {
    if (mode === "all") {
      if (dirtyScopeMonths.length === 0) {
        return;
      }
      for (const scopeMonth of dirtyScopeMonths) {
        clearDraftScopeSession(scopeMonth);
      }
      coach.actions?.onDraftDiscarded?.();
      return;
    }
    discardDraftChanges();
  };
  const maxVisibleItemsPerDayCell =
    viewMode === "week"
      ? Number.MAX_SAFE_INTEGER
      : expandedMonthRows
        ? Number.MAX_SAFE_INTEGER
        : 2;
  const calendarGridDayCellModels = useMemo(
    () =>
      (viewMode === "week" ? focusedWeekCells : cells).map((cell) =>
        selectPlannerCalendarDayCellRenderModel({
          cell,
          dayProjection: getCalendarDayProjection(cell.date),
          calendarToday,
        })
      ),
    [
      calendarToday,
      cells,
      focusedWeekCells,
      getCalendarDayProjection,
      viewMode,
    ]
  );
  const renderCalendarDayCell = (cellModel: PlannerCalendarDayCellRenderModel) => {
    return (
      <CalendarMonthDayCell
        key={`${viewMode}-${cellModel.day}`}
        day={cellModel.day}
        inMonth={cellModel.inMonth}
        isToday={cellModel.isToday}
        isPastInMonth={cellModel.isPastInMonth}
        ariaLabel={cellModel.ariaLabel}
        entriesForDay={cellModel.entriesForDay}
        completionFactMarkersForDay={cellModel.completionFactMarkersForDay}
        maxVisibleItems={maxVisibleItemsPerDayCell}
        isAnyEntryDragging={Boolean(draggingEntryKey)}
        getEntryDisplayTitle={getEntryDisplayTitleWithTime}
        isEntryCredited={isEntryCredited}
        isEntryImmovableForDraft={(entry) =>
          !canMutateEntryOnDay(entry, cellModel.day) || isEntryImmovableForDraft(entry)
        }
        onEntryClick={(day, entry) => {
          if (!canMutateEntryOnDay(entry, day)) {
            return;
          }
          openDayDetails(day);
        }}
        onCellClick={(target) => {
          if (draggingEntryKey) {
            return;
          }
          handleDayCellClick(cellModel.day, target);
        }}
        onCellMouseEnter={(target) => {
          handleDayCellMouseEnter(cellModel.day, target);
        }}
        onCellMouseLeave={() => {
          handleDayCellMouseLeave(cellModel.day);
        }}
        onCellPointerDown={(pointerType, target) => {
          handleDayCellPointerDown(pointerType, cellModel.day, target);
        }}
        onCellPointerUp={handleDayCellPointerEnd}
        onCellPointerCancel={handleDayCellPointerEnd}
        onCellPointerLeave={handleDayCellPointerLeave}
        onEntryPointerStart={(immovable) => {
          void immovable;
          suppressHoverForDrag({ clearPreview: true });
        }}
        onEntryPointerEnd={releaseHoverSuppression}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm" data-no-swipe="true">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                <h2 className="text-lg font-semibold">Calendar</h2>
                {hasDraftSession ? (
                  <Badge
                    data-testid="planner-preview-mode-badge"
                    className="h-7 border-yellow-300 bg-yellow-100 px-3 text-sm font-semibold text-orange-900 dark:border-yellow-300 dark:bg-yellow-100 dark:text-orange-900"
                  >
                    Planning Mode
                  </Badge>
                ) : null}
              </div>
              {horizonCounter ? (
                <p className="text-xs text-muted-foreground">
                  {horizonCounter.thisMonth} this month / {horizonCounter.total} total{" "}
                  {horizonCounter.remaining > 0
                    ? `· ${horizonCounter.remaining} remaining`
                    : "· all credited"}
                </p>
              ) : null}
              {eligibilityNotices.hardIneligible.length > 0 ? (
                <div className="rounded-md border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  {eligibilityNotices.hardIneligible
                    .slice(0, 4)
                    .map((item) => `${item.goalTitle}: ${item.reasonCopy}`)
                    .join(" · ")}
                  {eligibilityNotices.hardIneligible.length > 4
                    ? ` · +${eligibilityNotices.hardIneligible.length - 4} more`
                    : ""}
                </div>
              ) : null}
              {eligibilityNotices.scopeOnlyCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {eligibilityNotices.scopeOnlyCount} goal
                  {eligibilityNotices.scopeOnlyCount === 1 ? "" : "s"} outside this
                  month&apos;s planning scope.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canResetPlan ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={resetPlan}
                  disabled={loading || resetLoading}
                >
                  {resetLoading ? "Resetting..." : "Reset plan"}
                </Button>
              ) : canShowSaveAction ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={savePlan}
                  title={draftSaveBlockedMessage ?? undefined}
                  disabled={
                    saveLoading ||
                    loading ||
                    !context ||
                    scopeMonthsForSaveAction.length === 0 ||
                    (!hasDraftSession && !effectivePreview) ||
                    draftSaveBlocked
                  }
                >
                  {saveButtonLabel}
                </Button>
              ) : null}
              {currentScopeHasDraftSession ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => discardDraftChangesForMode("current")}
                  disabled={saveLoading || loading}
                >
                  Undo this month
                </Button>
              ) : null}
              {hasDraftSession && dirtyScopeMonths.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => discardDraftChangesForMode("all")}
                  disabled={saveLoading || loading}
                >
                  Undo all months
                </Button>
              ) : null}
              {context?.preferences ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Settings"
                  title="Settings"
                  onClick={() => setSettingsOpen(true)}
                  disabled={loading}
                >
                  <Settings className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showBlockingLoading ? (
        <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading planner month context...
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-destructive">
          {error}
        </div>
      ) : canShowSetup ? (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Settings className="size-4 text-primary" />
            <h3 className="text-base font-semibold">Plan setup</h3>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Confirm timezone and manual defaults before generating planner previews.
          </p>
          <PlannerPreferencesForm
            setupTimezone={setupTimezone}
            setSetupTimezone={setSetupTimezone}
            setupWeekStartsOn={setupWeekStartsOn}
            setSetupWeekStartsOn={setSetupWeekStartsOn}
            setupRestWeekdays={setupRestWeekdays}
            setSetupRestWeekdays={setSetupRestWeekdays}
            timezoneOptions={timezoneOptions}
            setupLoading={setupLoading}
            submitSetup={submitSetup}
          />
        </div>
      ) : month ? (
        <>
          <PlannerCalendarViewPanel
            viewModel={{
              ...plannerCalendarViewModel,
              viewMode,
              plannerViewModes: PLANNER_VIEW_MODES,
              loading,
              expandedMonthRows,
              focusedDay,
              focusedDayEntries,
              focusedDayCompletionFactMarkers,
              previewDayEntries,
              previewDayCompletionFactMarkers,
              mutationLoading: Boolean(mutationLoadingKey),
              weekdayLabels,
              calendarGridDayCellModels,
              dayPreview,
            }}
            saveState={plannerCalendarSaveStateModel}
            dndModel={{
              getDragEntryLabel,
              getDragDayLabel,
              renderEntryDragOverlay,
              handleDndEntryDragStart,
              handleDndEntryDragEnd,
              handleDndEntryDragCancel,
            }}
            entryModel={{
              getEntryDisplayTitleWithTime,
              getEntrySubtitle,
              isEntryCredited,
              canMutateEntryOnDay,
              isEntryImmovableForDraft,
              getDateFactDispatchForEntry,
              completionControlDisabledReasonForEntry,
              renderCalendarDayCell,
            }}
            handlers={{
              moveViewWindow,
              resetViewWindow,
              setExpandedMonthRows,
              setCalendarViewMode,
              openDayDetails,
              toggleDateFact,
              suppressHoverForDrag,
              releaseHoverSuppression,
              pinDayPreview,
              handleDayPreviewMouseEnter,
              handleDayPreviewMouseLeave,
              clearDayPreview,
              onSelectedDayChange,
            }}
            dayPreviewRef={dayPreviewRef}
          />

          <PlannerCoachPanel coach={coach} />

          <PlannerDayDetailDialogs
            dayDetailDay={dayDetailDay}
            selectedDayEntries={selectedDayEntries}
            selectedEventEntry={selectedEventEntry}
            selectedEventDraftEdit={selectedEventDraftEdit}
            selectedEventBaselineUnit={selectedEventBaselineUnit}
            mutationLoadingKey={mutationLoadingKey}
            canMutatePlanItems={canMutatePlanItems}
            closeDayDetails={closeDayDetails}
            closeEventDetails={closeEventDetails}
            selectEventEntry={selectEventEntry}
            toggleDateFact={toggleDateFact}
            toggleItemLock={toggleItemLock}
            updateDraftLabel={updateDraftLabel}
            updateDraftScheduledDate={updateDraftScheduledDate}
            updateDraftScheduledTimeOverride={updateDraftScheduledTimeOverride}
            getEntryDisplayTitleWithTime={getEntryDisplayTitleWithTime}
            getDateFactDispatchForEntry={getDateFactDispatchForEntry}
            completionControlDisabledReasonForEntry={
              completionControlDisabledReasonForEntry
            }
          />
        </>
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planner settings</DialogTitle>
            <DialogDescription>
              Update timezone and default planning policy for future previews.
            </DialogDescription>
          </DialogHeader>
          <PlannerPreferencesForm
            setupTimezone={setupTimezone}
            setSetupTimezone={setSetupTimezone}
            setupWeekStartsOn={setupWeekStartsOn}
            setSetupWeekStartsOn={setSetupWeekStartsOn}
            setupRestWeekdays={setupRestWeekdays}
            setSetupRestWeekdays={setSetupRestWeekdays}
            timezoneOptions={timezoneOptions}
            setupLoading={setupLoading}
            submitSetup={submitSetup}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
