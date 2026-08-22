"use client";

import { addDays, addMonths, format, isValid, parse } from "date-fns";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { LoadingCard } from "@/components/ui/loading-card";
import { allCategoriesValue } from "@/features/goals/goal-filters";
import {
  buildWeekdayLabels,
  getEntryGoalFirstTitleWithTime,
  getEntryMilestoneFirstTitleWithTime,
  getEntrySubtitle,
  isEntryCredited,
  isEntryImmovableForDraft,
  parseMonth,
} from "@/features/planner/calendar-format";
import {
  PlannerDndProvider,
} from "@/features/planner/calendar-dnd";
import {
  getCalendarTargetScrollTop,
  getTopVisibleCalendarDay,
} from "@/features/planner/calendar-scroll-position";
import { MoveSessionDialog } from "@/features/planner/move-session-dialog";
import { PlannerCoachPanel } from "@/features/planner/coach/planner-coach-panel";
import { usePlannerCoach } from "@/features/planner/coach/use-planner-coach";
import type { PlannerCoachBindings } from "@/features/planner/coach/coach-types";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";
import {
  draftCommandReducer,
  initialDraftCommandState,
} from "@/features/planner/draft-command-reducer";
import {
  getCompletionControlDisabledReason,
  getDateFactDispatchForEntry as resolveDateFactDispatchForEntry,
} from "@/features/planner/completion-entry-dispatch";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import {
  invalidatePlannerRelatedTabCaches,
} from "@/lib/cache/planner-tab-cache";
import {
  type PlannerPolicy,
} from "@/lib/planner/policy";
import type {
  CalendarSurfaceProps,
  CompletionControlDisabledReason,
  PlannerCalendarViewMode,
  DayPreviewState,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import {
  getNonPublishablePreviewMessage,
} from "@/features/planner/planner-save-availability";
import { PlannerDayEntriesPanel } from "@/features/planner/planner-day-entries-panel";
import { PlannerWarningsPanel } from "@/features/planner/planner-warnings-panel";
import { PlannerEventDetailDialog } from "@/features/planner/planner-event-detail-dialog";
import { buildMoveSourceOptions } from "@/features/planner/planner-move-source-options";
import { PlannerCalendarToolbar } from "@/features/planner/planner-calendar-toolbar";
import { PlannerViewWindowHeader } from "@/features/planner/planner-view-window-header";
import { PlannerFiltersDialog } from "@/features/planner/planner-filters-dialog";
import { PlannerSettingsDialog } from "@/features/planner/planner-settings-dialog";
import { PlannerDayPreviewPopover } from "@/features/planner/planner-day-preview-popover";
import { PlannerExpandedPreviewDialog } from "@/features/planner/planner-expanded-preview-dialog";
import { PlannerSettingsForm } from "@/features/planner/planner-settings-form";
import { PlannerRollingWeekStrip } from "@/features/planner/planner-rolling-week-strip";
import { usePlannerCalendarModel } from "@/features/planner/use-planner-calendar-model";
import { usePlannerEntryMutations } from "@/features/planner/use-planner-entry-mutations";
import { usePlannerPersistenceActions } from "@/features/planner/use-planner-persistence-actions";
import { usePlannerDraftCommands } from "@/features/planner/use-planner-draft-commands";
import { usePlannerCalendarDnd } from "@/features/planner/use-planner-calendar-dnd";
import { usePlannerMoveSessionDialog } from "@/features/planner/use-planner-move-session-dialog";
import { usePlannerCalendarDayCellRenderer } from "@/features/planner/use-planner-calendar-day-cell-renderer";
import { usePlannerContextLoader } from "@/features/planner/use-planner-context-loader";
import { usePlannerSetup } from "@/features/planner/use-planner-setup";
import { usePlannerPreviewSession } from "@/features/planner/use-planner-preview-session";
import { usePlannerDayPreviewInteractions } from "@/features/planner/use-planner-day-preview-interactions";
interface OpenGoalInstance {
  entryKey: string;
  day: string;
}

function isMonthScopedCalendarViewMode(viewMode: PlannerCalendarViewMode) {
  return viewMode === "month";
}

export function CalendarSurface({
  activeTab,
  month,
  selectedDay,
  viewMode,
  onMonthChange,
  onSelectedDayChange,
  onPlannerMutation,
  duoScope = "me",
  partnerCompletionMarkersByDate,
  partnerOverlayError,
}: CalendarSurfaceProps) {
  const [context, setContext] = useState<PlannerContextPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(allCategoriesValue);
  const [endMonthFilter, setEndMonthFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [draftPolicy, setDraftPolicy] = useState<PlannerPolicy | null>(null);
  const [draftPreview, setDraftPreview] = useState<
    NonNullable<PlannerContextPayload["preview"]> | null
  >(null);
  const [draftPreviewWindow, setDraftPreviewWindow] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [draftCommandState, dispatchDraftCommand] = useReducer(
    draftCommandReducer,
    initialDraftCommandState
  );
  const [selectedEventEntryKey, setSelectedEventEntryKey] = useState<string | null>(
    null
  );
  const [dayPreview, setDayPreview] = useState<DayPreviewState | null>(null);
  const [expandedPreviewDay, setExpandedPreviewDay] = useState<string | null>(null);
  const [moveDialogDay, setMoveDialogDay] = useState<string | null>(null);
  const [moveDialogSourceEntryKey, setMoveDialogSourceEntryKey] = useState<string>("");
  const [warningsOpen, setWarningsOpen] = useState(false);
  // Intentionally session-scoped for now; dismissal resets on page reload.
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [localSelectedDay, setLocalSelectedDay] = useState<string | null>(null);
  const [expandedMonthRows, setExpandedMonthRows] = useState(false);
  const [pendingMonthScrollAnchorDay, setPendingMonthScrollAnchorDay] = useState<
    string | null
  >(null);
  const [previewEntryOrderByDay, setPreviewEntryOrderByDay] = useState<
    Record<string, string[]>
  >({});
  const [mutationLoadingKey, setMutationLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupTimezone, setSetupTimezone] = useState(resolveUserTimezone());
  const [setupWeekStartsOn, setSetupWeekStartsOn] = useState(1);
  const [setupRestWeekdays, setSetupRestWeekdays] = useState<number[]>([]);
  const draftPolicyRef = useRef<PlannerPolicy | null>(null);
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const hoverPreviewCloseTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerPressActiveRef = useRef(false);
  const pointerInsideDayPreviewRef = useRef(false);
  const lastTouchTapRef = useRef<{ day: string; at: number } | null>(null);
  const suppressDayCellClickRef = useRef<{ day: string; active: boolean } | null>(null);
  const calendarPreparedRef = useRef(false);
  const dayPreviewRef = useRef<HTMLDivElement | null>(null);
  const rollingWeekStripRef = useRef<HTMLDivElement | null>(null);
  const multiMonthGridScrollRef = useRef<HTMLDivElement | null>(null);
  const monthScrollAlignmentKeyRef = useRef<string | null>(null);
  const monthScrollAnchorDayRef = useRef<string | null>(null);
  const isDayPreviewSurfaceTarget = (target: Element) =>
    Boolean(target.closest('[data-day-cell="true"]')) ||
    Boolean(dayPreviewRef.current?.contains(target));

  useEffect(() => {
    draftPolicyRef.current = draftPolicy;
  }, [draftPolicy]);

  const loadContext = usePlannerContextLoader({
    activeTab,
    month,
    selectedDay,
    viewMode,
    setupTimezone,
    setupWeekStartsOn,
    onMonthChange,
    setContext,
    setLoading,
    setError,
    setSetupTimezone,
    setSetupWeekStartsOn,
    setSetupRestWeekdays,
    draftPolicyRef,
    calendarPreparedRef,
  });

  useEffect(() => {
    if (activeTab !== "calendar") {
      calendarPreparedRef.current = false;
    }
  }, [activeTab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadContext();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadContext]);

  const handlePlannerMutation = useCallback(() => {
    invalidatePlannerRelatedTabCaches();
    onPlannerMutation();
  }, [onPlannerMutation]);
  const clearDraftSession = useCallback(() => {
    setDraftPolicy(null);
    setDraftPreview(null);
    setDraftPreviewWindow(null);
    dispatchDraftCommand({
      type: "clear",
    });
  }, []);
  const additionalProjectionDays = useMemo(
    () =>
      [
        localSelectedDay,
        expandedPreviewDay,
        moveDialogDay,
        dayPreview?.day ?? null,
      ].filter((day): day is string => Boolean(day)),
    [dayPreview?.day, expandedPreviewDay, localSelectedDay, moveDialogDay]
  );
  const {
    currentScopeMonth,
    weekStartsOn,
    calendarToday,
    viewProjection,
    warningModel,
    draftSession,
    dayAccessors,
    saveAvailability,
    viewWindow,
    eligibilityNotices,
    linkedTargetIndexes,
  } = usePlannerCalendarModel({
    context,
    draftPreview,
    draftPolicy,
    draftCommandState,
    month,
    selectedDay,
    viewMode,
    setupTimezone,
    duoScope,
    categoryFilter,
    endMonthFilter,
    searchQuery,
    partnerCompletionMarkersByDate,
    previewEntryOrderByDay,
    additionalProjectionDays,
  });
  const {
    cells,
    cellByDate,
    focusedDay,
    focusedWeekDays,
    focusedWeekCells,
  } = viewProjection;
  const weekdayLabels = useMemo(
    () => buildWeekdayLabels(weekStartsOn),
    [weekStartsOn]
  );
  const {
    effectiveDraftPolicy,
    effectivePreview,
    draftSaveCommands,
    hasDraftSession,
    draftWindowWorkUnits,
    draftWindowUnitByEntryKey,
    draftSaveWindowResult,
    draftSaveWindow,
  } = draftSession;
  const {
    entriesByDate,
    entryByKey,
    entryDayByKey,
    effectiveDraftItemEdits,
    unplaceableGoalSummaries,
    totalUnplacedCount,
    invalidLockGoalCount,
    capacityWarningGoalCount,
    categoryOptions,
    endMonthOptions,
    effectiveEndMonthFilter,
    getEntriesForDay,
    getCompletionFactMarkersForDay,
    getOrderedEntriesForDay,
    canMutateEntryOnDay,
    plannerReadOnly,
  } = dayAccessors;
  const effectiveSelectedDay = localSelectedDay;
  const selectedEventEntry = selectedEventEntryKey
    ? entryByKey.get(selectedEventEntryKey) ?? null
    : null;
  const selectedEventDraftEdit = selectedEventEntry
    ? effectiveDraftItemEdits[selectedEventEntry.key]
    : undefined;
  const selectedEventBaselineUnit = selectedEventEntry
    ? draftWindowUnitByEntryKey.get(selectedEventEntry.key) ?? null
    : null;
  const selectedEventDraftScheduledDate =
    selectedEventDraftEdit?.scheduledDate ??
    selectedEventEntry?.activeItem?.scheduled_date ??
    effectiveSelectedDay ??
    null;
  const selectedGoalOpenInstances = useMemo<OpenGoalInstance[]>(() => {
    if (!selectedEventEntry) {
      return [];
    }
    const nextInstances: OpenGoalInstance[] = [];
    const targetGoalId = selectedEventEntry.originalGoalId;
    const orderedDays = Array.from(entriesByDate.keys()).sort();
    for (const day of orderedDays) {
      const dayEntries = entriesByDate.get(day) ?? [];
      for (const entry of dayEntries) {
        if (entry.originalGoalId !== targetGoalId) {
          continue;
        }
        if (!entry.activeItem) {
          continue;
        }
        if (isEntryImmovableForDraft(entry)) {
          continue;
        }
        nextInstances.push({ entryKey: entry.key, day });
      }
    }
    return nextInstances;
  }, [entriesByDate, selectedEventEntry]);
  const selectedGoalOpenInstanceIndex = useMemo(
    () =>
      selectedEventEntryKey
        ? selectedGoalOpenInstances.findIndex(
            (instance) => instance.entryKey === selectedEventEntryKey
          )
        : -1,
    [selectedEventEntryKey, selectedGoalOpenInstances]
  );
  const canNavigateToFirstOpenInstance = selectedGoalOpenInstanceIndex > 0;
  const canNavigateToPreviousOpenInstance = selectedGoalOpenInstanceIndex > 0;
  const canNavigateToNextOpenInstance =
    selectedGoalOpenInstanceIndex >= 0 &&
    selectedGoalOpenInstanceIndex < selectedGoalOpenInstances.length - 1;
  const canNavigateToLastOpenInstance =
    selectedGoalOpenInstanceIndex >= 0 &&
    selectedGoalOpenInstanceIndex < selectedGoalOpenInstances.length - 1;
  const selectedEventDraftTimeInputValue =
    selectedEventDraftEdit?.scheduledTimeOverride === null
      ? ""
      : selectedEventDraftEdit?.scheduledTimeOverride ??
        selectedEventBaselineUnit?.scheduledTimeOverride ??
        "";
  const focusedDayEntries = useMemo(
    () => getOrderedEntriesForDay(focusedDay),
    [focusedDay, getOrderedEntriesForDay]
  );
  const focusedDayCompletionFactMarkers = useMemo(
    () => getCompletionFactMarkersForDay(focusedDay),
    [focusedDay, getCompletionFactMarkersForDay]
  );
  const previewDayEntries = useMemo(
    () => getOrderedEntriesForDay(dayPreview?.day ?? null),
    [dayPreview?.day, getOrderedEntriesForDay]
  );
  const previewDayCompletionFactMarkers = useMemo(
    () => getCompletionFactMarkersForDay(dayPreview?.day ?? null),
    [dayPreview?.day, getCompletionFactMarkersForDay]
  );
  const expandedPreviewEntries = useMemo(
    () => getOrderedEntriesForDay(expandedPreviewDay),
    [expandedPreviewDay, getOrderedEntriesForDay]
  );
  const expandedPreviewCompletionFactMarkers = useMemo(
    () => getCompletionFactMarkersForDay(expandedPreviewDay),
    [expandedPreviewDay, getCompletionFactMarkersForDay]
  );
  const moveDialogEntriesForTargetDay = useMemo(
    () => getOrderedEntriesForDay(moveDialogDay),
    [getOrderedEntriesForDay, moveDialogDay]
  );
  const scopeMonth = context?.scopeMonth ?? null;
  const {
    queueDraftMoveCommand,
    updateDraftLabel,
    updateDraftScheduledDate,
    updateDraftScheduledTimeOverride,
  } = usePlannerDraftCommands({
    context,
    scopeMonth,
    currentScopeMonth,
    draftWindowWorkUnits,
    draftWindowUnitByEntryKey,
    effectiveDraftItemEdits,
    draftSaveCommands,
    draftCommandState,
    dispatchDraftCommand,
  });
  const moveDialogSourceOptions = useMemo(
    () =>
      buildMoveSourceOptions({
        targetDay: moveDialogDay,
        scopeMonth,
        moveDialogEntriesForTargetDay,
        entriesByDate,
        draftWindowUnitByEntryKey,
        canMutateEntryOnDay,
        getEntryGoalFirstTitleWithTime,
      }),
    [
      canMutateEntryOnDay,
      draftWindowUnitByEntryKey,
      entriesByDate,
      moveDialogDay,
      moveDialogEntriesForTargetDay,
      scopeMonth,
    ]
  );
  const effectiveMoveDialogSourceEntryKey = useMemo(() => {
    if (
      moveDialogSourceEntryKey &&
      moveDialogSourceOptions.some(
        (option) => option.entryKey === moveDialogSourceEntryKey
      )
    ) {
      return moveDialogSourceEntryKey;
    }
    return moveDialogSourceOptions[0]?.entryKey ?? "";
  }, [moveDialogSourceEntryKey, moveDialogSourceOptions]);
  const selectedEventLinkedTargets = useMemo(
    () =>
      selectedEventEntry
        ? linkedTargetIndexes.linksBySourceGoalId.get(
            selectedEventEntry.originalGoalId
          ) ?? []
        : [],
    [linkedTargetIndexes.linksBySourceGoalId, selectedEventEntry]
  );
  const {
    warningSuggestedNextSteps,
    hasPlannerWarnings,
    plannerWarningSeverity,
    plannerWarningBannerCopy,
  } = warningModel;
  const {
    draftSaveBlocked,
    draftSaveBlockedMessage,
    rebuildBlockedMessage,
    canResetPlan,
    canRecoverPastSessions,
    hasUnsavedPlannerChanges,
    canShowSaveAction,
  } = saveAvailability;
  const {
    resolvedFocusedDay,
    viewHeading,
    fixedViewHeadingWidthCh,
    viewDescription,
    previousWindowAriaLabel,
    nextWindowAriaLabel,
    stepDays,
  } = viewWindow;
  const previousWarningSeverityRef = useRef(plannerWarningSeverity);
  useEffect(() => {
    if (
      plannerWarningSeverity === "actionable" &&
      previousWarningSeverityRef.current !== "actionable"
    ) {
      setWarningsDismissed(false);
    }
    previousWarningSeverityRef.current = plannerWarningSeverity;
  }, [plannerWarningSeverity]);
  useEffect(
    () => () => {
      if (hoverPreviewTimerRef.current) {
        window.clearTimeout(hoverPreviewTimerRef.current);
      }
      if (hoverPreviewCloseTimerRef.current) {
        window.clearTimeout(hoverPreviewCloseTimerRef.current);
      }
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const clearPointerPress = () => {
      pointerPressActiveRef.current = false;
    };
    window.addEventListener("pointerup", clearPointerPress);
    window.addEventListener("pointercancel", clearPointerPress);
    window.addEventListener("blur", clearPointerPress);
    return () => {
      window.removeEventListener("pointerup", clearPointerPress);
      window.removeEventListener("pointercancel", clearPointerPress);
      window.removeEventListener("blur", clearPointerPress);
    };
  }, []);

  useEffect(() => {
    if (!dayPreview) {
      pointerInsideDayPreviewRef.current = false;
    }
  }, [dayPreview]);

  const dayPreviewInteractions = usePlannerDayPreviewInteractions({
    dayPreview,
    setDayPreview,
    setExpandedPreviewDay,
    setMoveDialogDay,
    setMoveDialogSourceEntryKey,
    setSelectedEventEntryKey,
    setLocalSelectedDay,
    onSelectedDayChange,
    hoverPreviewTimerRef,
    hoverPreviewCloseTimerRef,
    longPressTimerRef,
    longPressTriggeredRef,
    pointerPressActiveRef,
    pointerInsideDayPreviewRef,
    lastTouchTapRef,
    suppressDayCellClickRef,
    dayPreviewRef,
    isDayPreviewSurfaceTarget,
  });
  const {
    clearHoverPreviewTimer,
    clearHoverPreviewCloseTimer,
    openMoveDialogForDay,
  } = dayPreviewInteractions;

  const {
    recoverLoading,
    requestPreviewForWindow,
    refreshDraftPreview,
    applyPolicyReplanMoves,
    recoverPastSessions,
    clearDraftMoveCommands,
    cacheDraftPreviewForWindow,
  } = usePlannerPreviewSession({
    context,
    effectivePreview,
    effectiveDraftPolicy,
    draftSaveWindow,
    draftSaveWindowResult,
    draftWindowWorkUnits,
    draftCommandState,
    draftSaveCommands,
    dispatchDraftCommand,
    setDraftPreview,
    setDraftPreviewWindow,
  });

  const nonPublishablePreviewMessage = useCallback(
    (preview: NonNullable<PlannerContextPayload["preview"]>) =>
      getNonPublishablePreviewMessage({
        preview,
        context,
        draftSaveWindow,
      }),
    [context, draftSaveWindow]
  );
  const { setupLoading, submitSetup } = usePlannerSetup({
    setupTimezone,
    setupWeekStartsOn,
    setupRestWeekdays,
    month,
    onMonthChange,
    clearDraftSession,
    handlePlannerMutation,
    loadContext,
    setSettingsOpen,
  });

  const runCompletionMutation = useCompletionMutation();
  const queueDraftMoveCommandRef = useRef<
    (args: {
      entry: PlannerDayDetailEntry;
      nextDate: string;
      source: "date_input" | "drag_drop" | "coach";
    }) => boolean
  >(() => false);
  const handleCoachGoalsCreated = useCallback(async () => {
    handlePlannerMutation();
    const refreshed = await loadContext({
      showLoading: false,
      toastOnError: true,
      forcePrepare: true,
    });
    if (!refreshed) {
      throw new Error("Planner preparation did not complete.");
    }
  }, [handlePlannerMutation, loadContext]);
  const coachBindings: PlannerCoachBindings = {
    refreshDraftPreview,
    applyPolicyReplanMoves,
    queueDraftMoveCommand: (args) => queueDraftMoveCommandRef.current(args),
    clearDraftMoveCommands,
    applyDraftPolicy: (policy) => {
      setDraftPolicy(policy);
      setSetupRestWeekdays([...policy.restWeekdays].sort((left, right) => left - right));
    },
    coachWindow: draftSaveWindow,
    getNonPublishablePreviewMessage: nonPublishablePreviewMessage,
  };
  const coach = usePlannerCoach({
    activeTab,
    context,
    entriesByDate,
    effectivePreview,
    effectiveDraftPolicy,
    hasDraftSession,
    onGoalsCreated: handleCoachGoalsCreated,
    ...coachBindings,
  });

  const isValidIsoDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const parsed = parse(value, "yyyy-MM-dd", new Date());
    return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value;
  };

  useEffect(() => {
    queueDraftMoveCommandRef.current = queueDraftMoveCommand;
  }, [queueDraftMoveCommand]);

  const {
    draggingEntryKey,
    getDragEntryLabel,
    getDragDayLabel,
    renderEntryDragOverlay,
    handleDndEntryDragStart,
    handleDndEntryDragEnd,
    handleDndEntryDragCancel,
  } = usePlannerCalendarDnd({
    entryByKey,
    entryDayByKey,
    getEntriesForDay,
    getEntryGoalFirstTitleWithTime,
    setPreviewEntryOrderByDay,
    queueDraftMoveCommand,
    clearHoverPreviewTimer,
    pointerPressActiveRef,
  });
  const canMutatePlanItems = Boolean(
    context?.activePlan?.plan.status === "active"
  );

  const getDateFactDispatchForEntry = (
    entry: PlannerDayDetailEntry,
    selectedDate: string | null = effectiveSelectedDay
  ) =>
    resolveDateFactDispatchForEntry({
      entry,
      selectedDate,
      asOfDate: context?.asOfDate ?? null,
    });

  const completionControlDisabledReasonForEntry = (
    entry: PlannerDayDetailEntry,
    dispatch: ReturnType<typeof getDateFactDispatchForEntry>
  ): CompletionControlDisabledReason | null => {
    return getCompletionControlDisabledReason({
      entry,
      dispatch,
      canMutatePlanItems,
    });
  };

  const { toggleItemLock, toggleDateFact } = usePlannerEntryMutations({
    context,
    hasDraftSession,
    draftSaveCommands,
    effectiveDraftPolicy,
    effectiveDraftItemEdits,
    effectiveSelectedDay,
    setMutationLoadingKey,
    getDateFactDispatchForEntry,
    completionControlDisabledReasonForEntry,
    runCompletionMutation,
    handlePlannerMutation,
    loadContext,
    refreshDraftPreview,
  });

  const closeMoveDialog = () => {
    setMoveDialogDay(null);
    setMoveDialogSourceEntryKey("");
  };

  const { submitMoveDialog } = usePlannerMoveSessionDialog({
    moveDialogDay,
    effectiveMoveDialogSourceEntryKey,
    moveDialogSourceOptions,
    queueDraftMoveCommand,
    isValidIsoDate,
    closeMoveDialog,
  });

  const contractExpandedPreview = () => {
    if (!expandedPreviewDay) {
      return;
    }
    const day = expandedPreviewDay;
    const dayCell = document.querySelector(
      `[data-day-cell="true"][data-day="${day}"]`
    );
    if (dayCell instanceof HTMLElement) {
      dayPreviewInteractions.openDayPreview({
        day,
        pinned: true,
        target: dayCell,
      });
    }
    setExpandedPreviewDay(null);
  };

  const {
    saveLoading,
    resetLoading,
    fullResetLoading,
    rebuildLoading,
    savePlan,
    resetPlan,
    resetPlanFully,
    rebuildSchedule,
    discardDraftChanges,
  } = usePlannerPersistenceActions({
      context,
      month,
      hasDraftSession,
      draftSaveWindow,
      draftSaveWindowResult,
      draftSaveCommands,
      effectiveDraftPolicy,
      draftPreview,
      draftPreviewWindow,
      clearDraftSession,
      handlePlannerMutation,
      loadContext,
      cacheDraftPreviewForWindow,
      requestPreviewForWindow,
      coachActions: coach.actions,
    });

  const showBlockingLoading = loading && context === null;
  const navigateToOpenInstance = useCallback(
    (target: OpenGoalInstance | undefined) => {
      if (!target) {
        return;
      }
      setSelectedEventEntryKey(target.entryKey);
      setLocalSelectedDay(target.day);
      if (viewMode === "month") {
        onMonthChange(target.day.slice(0, 7), "replace");
        return;
      }
      onSelectedDayChange(target.day, "replace", viewMode);
    },
    [onMonthChange, onSelectedDayChange, viewMode]
  );
  const resolveMonthScopedTopRowDay = useCallback(() => {
    const container = multiMonthGridScrollRef.current;
    return container ? getTopVisibleCalendarDay(container) : null;
  }, []);
  const handleMonthScopedGridScroll = useCallback(() => {
    if (!isMonthScopedCalendarViewMode(viewMode)) {
      return;
    }
    const topRowDay = resolveMonthScopedTopRowDay();
    if (topRowDay) {
      monthScrollAnchorDayRef.current = topRowDay;
    }
  }, [resolveMonthScopedTopRowDay, viewMode]);
  const monthScrollAnchorDay = useMemo(() => {
    if (!month || !isMonthScopedCalendarViewMode(viewMode)) {
      return null;
    }
    const preservedTopRowDay = pendingMonthScrollAnchorDay;
    if (preservedTopRowDay && cellByDate.has(preservedTopRowDay)) {
      return preservedTopRowDay;
    }
    for (const day of focusedWeekDays) {
      if (cellByDate.has(day)) {
        return day;
      }
    }
    if (cellByDate.has(calendarToday)) {
      return calendarToday;
    }
    return cells[0]?.date ?? null;
  }, [
    calendarToday,
    cellByDate,
    cells,
    focusedWeekDays,
    month,
    pendingMonthScrollAnchorDay,
    viewMode,
  ]);
  const resolveWeekdayAlignedAnchorDay = useCallback(
    (rowStartDay: string) => {
      const rowWeekDays = Array.from({ length: 7 }, (_, index) =>
        format(addDays(parse(rowStartDay, "yyyy-MM-dd", new Date()), index), "yyyy-MM-dd")
      );
      const parsedToday = parse(calendarToday, "yyyy-MM-dd", new Date());
      if (!isValid(parsedToday)) {
        return rowWeekDays[0] ?? rowStartDay;
      }
      const weekdayOffset = (parsedToday.getDay() - setupWeekStartsOn + 7) % 7;
      return rowWeekDays[weekdayOffset] ?? rowWeekDays[0] ?? rowStartDay;
    },
    [calendarToday, setupWeekStartsOn]
  );
  const moveViewWindow = (direction: -1 | 1) => {
    if (isMonthScopedCalendarViewMode(viewMode)) {
      if (!month) {
        return;
      }
      onMonthChange(
        format(addMonths(parseMonth(month), direction), "yyyy-MM"),
        "push"
      );
      return;
    }
    const baseDay = parse(resolvedFocusedDay, "yyyy-MM-dd", new Date());
    const nextDay = format(addDays(baseDay, direction * stepDays), "yyyy-MM-dd");
    onSelectedDayChange(nextDay, "push", viewMode);
  };
  const setCalendarViewMode = (nextViewMode: PlannerCalendarViewMode) => {
    if (nextViewMode === viewMode) {
      return;
    }
    setDayPreview(null);
    const monthScopedTopRowDay = isMonthScopedCalendarViewMode(viewMode)
      ? resolveMonthScopedTopRowDay() ?? monthScrollAnchorDayRef.current
      : null;
    const rowAnchorDay =
      monthScopedTopRowDay ??
      focusedWeekDays[0] ??
      focusedDay;
    const anchorDay = resolveWeekdayAlignedAnchorDay(rowAnchorDay);
    if (isMonthScopedCalendarViewMode(nextViewMode)) {
      setPendingMonthScrollAnchorDay(rowAnchorDay);
    }
    onSelectedDayChange(anchorDay, "push", nextViewMode);
  };
  const alignRollingWeekStripToFocusedDay = useCallback(() => {
    if (viewMode !== "day" && viewMode !== "three_day") {
      return;
    }
    const strip = rollingWeekStripRef.current;
    if (!strip) {
      return;
    }
    const weekGrid = strip.querySelector<HTMLElement>('[data-rolling-week-grid="cells"]');
    const firstCell = weekGrid?.firstElementChild;
    if (!(firstCell instanceof HTMLElement) || !weekGrid) {
      return;
    }
    const focusedDayIndex = focusedWeekDays.indexOf(focusedDay);
    if (focusedDayIndex < 0) {
      return;
    }
    const gridStyles = window.getComputedStyle(weekGrid);
    const columnGap = Number.parseFloat(gridStyles.columnGap || "0");
    const columnWidth = firstCell.getBoundingClientRect().width;
    if (!Number.isFinite(columnWidth) || columnWidth <= 0) {
      return;
    }
    const visibleColumnCount = Math.max(
      1,
      Math.round((strip.clientWidth + columnGap) / (columnWidth + columnGap))
    );
    const leftMostVisibleIndex = Math.max(
      0,
      Math.min(
        focusedDayIndex - Math.floor(visibleColumnCount / 2),
        Math.max(0, focusedWeekDays.length - visibleColumnCount)
      )
    );
    strip.scrollTo({
      left: leftMostVisibleIndex * (columnWidth + columnGap),
      behavior: "auto",
    });
  }, [focusedDay, focusedWeekDays, viewMode]);
  useEffect(() => {
    if (viewMode !== "day" && viewMode !== "three_day") {
      return;
    }
    const frame = window.requestAnimationFrame(alignRollingWeekStripToFocusedDay);
    window.addEventListener("resize", alignRollingWeekStripToFocusedDay);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", alignRollingWeekStripToFocusedDay);
    };
  }, [alignRollingWeekStripToFocusedDay, viewMode]);
  useEffect(() => {
    if (!isMonthScopedCalendarViewMode(viewMode)) {
      monthScrollAlignmentKeyRef.current = null;
      return;
    }
    if (!context) {
      return;
    }
    const container = multiMonthGridScrollRef.current;
    if (!container || !monthScrollAnchorDay || !month) {
      return;
    }
    const scrollKey = `${viewMode}:${month}:${monthScrollAnchorDay}`;
    if (monthScrollAlignmentKeyRef.current === scrollKey) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const anchorCell = container.querySelector<HTMLElement>(
        `[data-day-cell="true"][data-day="${monthScrollAnchorDay}"]`
      );
      if (!anchorCell) {
        return;
      }
      monthScrollAlignmentKeyRef.current = scrollKey;
      monthScrollAnchorDayRef.current = monthScrollAnchorDay;
      const nextTop = getCalendarTargetScrollTop(container, anchorCell);
      if (typeof container.scrollTo === "function") {
        container.scrollTo({
          top: nextTop,
          behavior: "auto",
        });
      } else {
        container.scrollTop = nextTop;
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    context,
    month,
    monthScrollAnchorDay,
    viewMode,
  ]);
  const saveButtonLabel = saveLoading ? "Saving..." : "Save plan";
  const renderCalendarDayCell = usePlannerCalendarDayCellRenderer({
    viewMode,
    expandedMonthRows,
    draggingEntryKey,
    calendarToday,
    focusedDay,
    plannerReadOnly,
    onSelectedDayChange,
    setLocalSelectedDay,
    setSelectedEventEntryKey,
    setDayPreview,
    canMutateEntryOnDay,
    getOrderedEntriesForDay,
    getCompletionFactMarkersForDay,
    dayPreviewInteractions,
  });
  const rollingWeekStrip = (
    <PlannerRollingWeekStrip
      rollingWeekStripRef={rollingWeekStripRef}
      viewMode={viewMode}
      focusedWeekDays={focusedWeekDays}
      focusedWeekCells={focusedWeekCells}
      renderCalendarDayCell={renderCalendarDayCell}
    />
  );

  const plannerSettingsForm = (
    <PlannerSettingsForm
      setupRestWeekdays={setupRestWeekdays}
      onSetupRestWeekdaysChange={setSetupRestWeekdays}
      setupLoading={setupLoading}
      plannerReadOnly={plannerReadOnly}
      recoverLoading={recoverLoading}
      loading={loading}
      saveLoading={saveLoading}
      canRecoverPastSessions={canRecoverPastSessions}
      canResetPlan={canResetPlan}
      resetLoading={resetLoading}
      rebuildLoading={rebuildLoading}
      hasDraftSession={hasDraftSession}
      canShowSaveAction={canShowSaveAction}
      rebuildBlockedMessage={rebuildBlockedMessage}
      fullResetLoading={fullResetLoading}
      onSaveSettings={() => {
        void submitSetup();
      }}
      onRecover={() => {
        void recoverPastSessions();
      }}
      onUnlockAllGoals={resetPlan}
      onRefreshCalendar={() => {
        void rebuildSchedule();
      }}
      onFullReset={() => {
        void resetPlanFully();
      }}
    />
  );

  return (
    <div className="space-y-4">
      <PlannerWarningsPanel
        hasPlannerWarnings={hasPlannerWarnings}
        warningsDismissed={warningsDismissed}
        showBlockingLoading={showBlockingLoading}
        error={error}
        plannerWarningBannerCopy={plannerWarningBannerCopy}
        warningsOpen={warningsOpen}
        setWarningsOpen={setWarningsOpen}
        onDismissBanner={() => setWarningsDismissed(true)}
        unplaceableGoalSummaries={unplaceableGoalSummaries}
        invalidLockGoalCount={invalidLockGoalCount}
        capacityWarningGoalCount={capacityWarningGoalCount}
        totalUnplacedCount={totalUnplacedCount}
        warningSuggestedNextSteps={warningSuggestedNextSteps}
        eligibilityNotices={eligibilityNotices}
        plannerReadOnly={plannerReadOnly}
        canResetPlan={canResetPlan}
        resetLoading={resetLoading}
        loading={loading}
        onUnlockAllGoals={() => {
          setWarningsOpen(false);
          void resetPlan();
        }}
        onOpenPlannerSettings={() => {
          setWarningsOpen(false);
          setSettingsOpen(true);
        }}
      />
      <PlannerCalendarToolbar
        hasDraftSession={hasDraftSession}
        plannerReadOnly={plannerReadOnly}
        canShowSaveAction={canShowSaveAction}
        saveButtonLabel={saveButtonLabel}
        draftSaveBlockedMessage={draftSaveBlockedMessage}
        saveDisabled={
          saveLoading ||
          loading ||
          !context ||
          !draftSaveWindow ||
          !hasUnsavedPlannerChanges ||
          draftSaveBlocked
        }
        undoDisabled={saveLoading || loading}
        loading={loading}
        viewMode={viewMode}
        canOpenSettings={Boolean(context?.preferences)}
        searchQuery={searchQuery}
        onSave={savePlan}
        onDiscardDraftChanges={discardDraftChanges}
        onViewModeChange={setCalendarViewMode}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onSearchQueryChange={setSearchQuery}
      />

      {partnerOverlayError ? (
        <p className="text-xs text-muted-foreground">{partnerOverlayError}</p>
      ) : null}
      {showBlockingLoading ? (
        <LoadingCard
          title="Loading planner context..."
          description="Preparing your schedule and completion state."
        />
      ) : error ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-destructive">
          {error}
        </div>
      ) : month ? (
        <>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <PlannerViewWindowHeader
              loading={loading}
              viewMode={viewMode}
              previousWindowAriaLabel={previousWindowAriaLabel}
              nextWindowAriaLabel={nextWindowAriaLabel}
              fixedViewHeadingWidthCh={fixedViewHeadingWidthCh}
              viewHeading={viewHeading}
              viewDescription={viewDescription}
              expandedMonthRows={expandedMonthRows}
              onMoveViewWindow={moveViewWindow}
              onToggleExpandedMonthRows={() =>
                setExpandedMonthRows((current) => !current)
              }
            />
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
                } ${isMonthScopedCalendarViewMode(viewMode) ? "min-h-[34rem]" : "min-h-[26rem]"}`}
              >
                {viewMode === "day" ? (
                  <div className="space-y-2">
                    {rollingWeekStrip}
                    <div className="rounded-md border p-3">
                      <p className="mb-2 text-sm font-medium">
                        {format(parse(focusedDay, "yyyy-MM-dd", new Date()), "EEE MMM d, yyyy")}
                      </p>
                      <PlannerDayEntriesPanel
                        day={focusedDay}
                        entries={focusedDayEntries}
                        completionFactMarkers={focusedDayCompletionFactMarkers}
                        mutationLoading={Boolean(mutationLoadingKey)}
                        asOfDate={context?.asOfDate ?? null}
                        canMutatePlanItems={canMutatePlanItems}
                        canMutateEntryOnDay={canMutateEntryOnDay}
                        getEntryDisplayTitle={getEntryMilestoneFirstTitleWithTime}
                        getEntrySubtitle={getEntrySubtitle}
                        isEntryCredited={isEntryCredited}
                        isEntryImmovableForDraft={isEntryImmovableForDraft}
                        onEntryOpen={(entryKey) => {
                          const entry = focusedDayEntries.find(
                            (candidate) => candidate.key === entryKey
                          );
                          if (!entry || !canMutateEntryOnDay(entry, focusedDay)) {
                            return;
                          }
                          setLocalSelectedDay(focusedDay);
                          setSelectedEventEntryKey(entry.key);
                        }}
                        onToggleCompletion={(entry, day) => {
                          if (!canMutateEntryOnDay(entry, day)) {
                            return;
                          }
                          void toggleDateFact(entry, day);
                        }}
                        onEntryPointerStart={(immovable) => {
                          void immovable;
                          pointerPressActiveRef.current = true;
                        }}
                        onEntryPointerEnd={() => {
                          pointerPressActiveRef.current = false;
                        }}
                        density="expanded"
                        includeSourceElement={false}
                      />
                    </div>
                  </div>
                ) : viewMode === "three_day" ? (
                  rollingWeekStrip
                ) : (
                  <div className="mx-auto w-full max-w-[56rem]">
                    <div className="overflow-x-auto pb-1">
                      <div className="grid min-w-[calc(7*((100%-1rem)/3))] grid-cols-[repeat(7,minmax(0,calc((100%-1rem)/3)))] gap-2 text-center text-xs text-muted-foreground md:min-w-0 md:grid-cols-7">
                        {weekdayLabels.map((weekday) => (
                          <span key={weekday}>{weekday}</span>
                        ))}
                      </div>
                      {isMonthScopedCalendarViewMode(viewMode) ? (
                        <div
                          ref={multiMonthGridScrollRef}
                          onScroll={handleMonthScopedGridScroll}
                          className="mt-2 max-h-[34rem] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        >
                          <div className="grid min-w-[calc(7*((100%-1rem)/3))] grid-cols-[repeat(7,minmax(0,calc((100%-1rem)/3)))] gap-2 md:min-w-0 md:grid-cols-7">
                            {cells.map(renderCalendarDayCell)}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 grid min-w-[calc(7*((100%-1rem)/3))] grid-cols-[repeat(7,minmax(0,calc((100%-1rem)/3)))] gap-2 md:min-w-0 md:grid-cols-7">
                          {(viewMode === "week" ? focusedWeekCells : cells).map(
                            renderCalendarDayCell
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {draftSaveBlockedMessage ? (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-100 p-2 text-xs text-amber-950 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-950">
                    <p className="font-medium">Preview save is currently blocked.</p>
                    <p className="mt-1 text-amber-900">
                      {draftSaveBlockedMessage}
                    </p>
                  </div>
                ) : null}

                {viewMode !== "day" && dayPreview ? (
                  <PlannerDayPreviewPopover
                    dayPreview={dayPreview}
                    popupRef={dayPreviewRef}
                    entries={previewDayEntries}
                    completionFactMarkers={previewDayCompletionFactMarkers}
                    mutationLoading={Boolean(mutationLoadingKey)}
                    asOfDate={context?.asOfDate ?? null}
                    canMutatePlanItems={canMutatePlanItems}
                    canMutateEntryOnDay={canMutateEntryOnDay}
                    getEntryDisplayTitle={getEntryGoalFirstTitleWithTime}
                    getEntrySubtitle={getEntrySubtitle}
                    isEntryCredited={isEntryCredited}
                    isEntryImmovableForDraft={isEntryImmovableForDraft}
                    onEntryOpen={(entryKey, day) => {
                      const entry = previewDayEntries.find(
                        (candidate) => candidate.key === entryKey
                      );
                      if (!entry || !canMutateEntryOnDay(entry, day)) {
                        return;
                      }
                      setLocalSelectedDay(day);
                      setSelectedEventEntryKey(entry.key);
                    }}
                    onToggleCompletion={(entry, day, sourceElement) => {
                      if (!canMutateEntryOnDay(entry, day)) {
                        return;
                      }
                      void toggleDateFact(entry, day, sourceElement);
                    }}
                    onEntryPointerStart={(immovable) => {
                      void immovable;
                      pointerPressActiveRef.current = true;
                    }}
                    onEntryPointerEnd={() => {
                      pointerPressActiveRef.current = false;
                    }}
                    onMoveDay={openMoveDialogForDay}
                    onExpandDay={(day) => {
                      setExpandedPreviewDay(day);
                      setDayPreview(null);
                    }}
                    onClose={() => setDayPreview(null)}
                    onPointerDownCapture={() => {
                      setDayPreview((current) =>
                        current && !current.pinned ? { ...current, pinned: true } : current
                      );
                    }}
                    onMouseEnter={() => {
                      pointerInsideDayPreviewRef.current = true;
                      clearHoverPreviewTimer();
                      clearHoverPreviewCloseTimer();
                    }}
                    onMouseLeave={() => {
                      pointerInsideDayPreviewRef.current = false;
                      if (dayPreview.pinned) {
                        return;
                      }
                      clearHoverPreviewTimer();
                      clearHoverPreviewCloseTimer();
                      setDayPreview(null);
                    }}
                  />
                ) : null}
              </div>
            </PlannerDndProvider>
          </div>

          <PlannerCoachPanel coach={coach} />

          <PlannerExpandedPreviewDialog
            expandedPreviewDay={expandedPreviewDay}
            entries={expandedPreviewEntries}
            completionFactMarkers={expandedPreviewCompletionFactMarkers}
            mutationLoading={Boolean(mutationLoadingKey)}
            asOfDate={context?.asOfDate ?? null}
            canMutatePlanItems={canMutatePlanItems}
            canMutateEntryOnDay={canMutateEntryOnDay}
            getEntryDisplayTitle={getEntryGoalFirstTitleWithTime}
            getEntrySubtitle={getEntrySubtitle}
            isEntryCredited={isEntryCredited}
            isEntryImmovableForDraft={isEntryImmovableForDraft}
            onOpenChange={(open) => {
              if (!open) {
                setExpandedPreviewDay(null);
              }
            }}
            onMoveDay={openMoveDialogForDay}
            onContract={contractExpandedPreview}
            onEntryOpen={(entryKey, day) => {
              const entry = expandedPreviewEntries.find(
                (candidate) => candidate.key === entryKey
              );
              if (!entry || !canMutateEntryOnDay(entry, day)) {
                return;
              }
              setExpandedPreviewDay(null);
              setLocalSelectedDay(day);
              setSelectedEventEntryKey(entry.key);
            }}
            onToggleCompletion={(entry, day, sourceElement) => {
              if (!canMutateEntryOnDay(entry, day)) {
                return;
              }
              void toggleDateFact(entry, day, sourceElement);
            }}
            onEntryPointerStart={(immovable) => {
              void immovable;
              pointerPressActiveRef.current = true;
            }}
            onEntryPointerEnd={() => {
              pointerPressActiveRef.current = false;
            }}
          />

          <MoveSessionDialog
            open={Boolean(moveDialogDay)}
            targetDate={moveDialogDay ?? ""}
            selectedSourceEntryKey={effectiveMoveDialogSourceEntryKey}
            sourceOptions={moveDialogSourceOptions.map(
              (option) => ({
                entryKey: option.entryKey,
                sourceDay: option.sourceDay,
                sourceLabel: option.sourceLabel,
              })
            )}
            onOpenChange={(open) => {
              if (!open) {
                closeMoveDialog();
              }
            }}
            onSourceChange={setMoveDialogSourceEntryKey}
            onCancel={closeMoveDialog}
            onSubmit={submitMoveDialog}
            submitDisabled={!effectiveMoveDialogSourceEntryKey}
          />

          <PlannerEventDetailDialog
            selectedEventEntry={selectedEventEntry}
            selectedEventLinkedTargets={selectedEventLinkedTargets}
            goalTitles={context?.goalTitles ?? {}}
            scopeMonth={context?.scopeMonth ?? month ?? "1970-01"}
            selectedEventDraftEdit={selectedEventDraftEdit}
            selectedEventBaselineUnit={selectedEventBaselineUnit}
            selectedEventDraftScheduledDate={selectedEventDraftScheduledDate}
            selectedEventDraftTimeInputValue={selectedEventDraftTimeInputValue}
            mutationLoadingKey={mutationLoadingKey}
            canMutatePlanItems={canMutatePlanItems}
            canNavigateToFirstOpenInstance={canNavigateToFirstOpenInstance}
            canNavigateToPreviousOpenInstance={canNavigateToPreviousOpenInstance}
            canNavigateToNextOpenInstance={canNavigateToNextOpenInstance}
            canNavigateToLastOpenInstance={canNavigateToLastOpenInstance}
            getEntryGoalFirstTitleWithTime={getEntryGoalFirstTitleWithTime}
            callbacks={{
              onOpenChange: (open) => {
                if (!open) {
                  setSelectedEventEntryKey(null);
                  setLocalSelectedDay(null);
                }
              },
              onUpdateDraftLabel: updateDraftLabel,
              onUpdateDraftScheduledDate: updateDraftScheduledDate,
              onUpdateDraftScheduledTimeOverride: updateDraftScheduledTimeOverride,
              onToggleItemLock: (entry) => {
                void toggleItemLock(entry);
              },
              onNavigateToFirstOpenInstance: () => {
                navigateToOpenInstance(selectedGoalOpenInstances[0]);
              },
              onNavigateToPreviousOpenInstance: () => {
                if (selectedGoalOpenInstanceIndex <= 0) {
                  return;
                }
                navigateToOpenInstance(
                  selectedGoalOpenInstances[selectedGoalOpenInstanceIndex - 1]
                );
              },
              onNavigateToNextOpenInstance: () => {
                if (
                  selectedGoalOpenInstanceIndex < 0 ||
                  selectedGoalOpenInstanceIndex >= selectedGoalOpenInstances.length - 1
                ) {
                  return;
                }
                navigateToOpenInstance(
                  selectedGoalOpenInstances[selectedGoalOpenInstanceIndex + 1]
                );
              },
              onNavigateToLastOpenInstance: () => {
                navigateToOpenInstance(
                  selectedGoalOpenInstances[selectedGoalOpenInstances.length - 1]
                );
              },
            }}
          />

        </>
      ) : null}

      <PlannerFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        categoryOptions={categoryOptions}
        endMonthFilter={effectiveEndMonthFilter}
        onEndMonthFilterChange={setEndMonthFilter}
        endMonthOptions={endMonthOptions}
      />

      <PlannerSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        {plannerSettingsForm}
      </PlannerSettingsDialog>
    </div>
  );
}
