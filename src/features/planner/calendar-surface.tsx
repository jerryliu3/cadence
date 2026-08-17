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
import { toast } from "sonner";
import { LoadingCard } from "@/components/ui/loading-card";
import { allCategoriesValue } from "@/features/goals/goal-filters";
import {
  buildWeekdayLabels,
  getEntryDisplayTitleWithTime,
  getEntrySubtitle,
  getMonthInTimezone,
  isEntryCredited,
  isEntryImmovableForDraft,
  normalizeWeekStartsOn,
  parseMonth,
} from "@/features/planner/calendar-format";
import {
  PlannerDndProvider,
} from "@/features/planner/calendar-dnd";
import { MoveSessionDialog } from "@/features/planner/move-session-dialog";
import { PlannerCoachPanel } from "@/features/planner/coach/planner-coach-panel";
import { usePlannerCoach } from "@/features/planner/coach/use-planner-coach";
import type { PlannerCoachBindings } from "@/features/planner/coach/coach-types";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";
import {
  draftCommandReducer,
  initialDraftCommandState,
  selectDraftCommands,
} from "@/features/planner/draft-command-reducer";
import {
  getCompletionControlDisabledReason,
  getDateFactDispatchForEntry as resolveDateFactDispatchForEntry,
} from "@/features/planner/completion-entry-dispatch";
import {
  buildPlannerRecoveryPlan,
  buildPlannerRecoveryWindow,
  describePlannerRecoveryOutcome,
} from "@/lib/planner/recovery";
import { computeDayPreviewPosition } from "@/features/planner/day-preview-popup";
import { shouldBlockAutomatedReplanMoveForEntry } from "@/features/planner/replan-move-guard";
import { isValidIanaTimezone, resolveUserTimezone } from "@/lib/dates/timezone";
import {
  getApiErrorMessage,
  getJson,
  postJson,
  putJson,
} from "@/lib/api/client";
import { useOutsidePointerDismiss } from "@/lib/ui/use-outside-pointer-dismiss";
import {
  readTabDataCache,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";
import {
  invalidatePlannerRelatedTabCaches,
  PLANNER_CONTEXT_CACHE_PREFIX,
} from "@/lib/cache/planner-tab-cache";
import {
  draftCommandEntryKey,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import {
  PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE,
  tryBuildPlannerDraftSaveWindow,
  plannerDraftWindowUnavailableMessage
} from "@/lib/planner/draft-window";
import {
  getScopeDateRange,
} from "@/lib/planner/dates";
import {
  createDefaultPlannerPolicy,
  type PlannerPolicy,
} from "@/lib/planner/policy";
import type {
  CalendarSurfaceProps,
  CompletionControlDisabledReason,
  PlannerCalendarViewMode,
  DayPreviewState,
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerPreferencesPayload,
  PlannerPreviewResponsePayload,
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
const DAY_PREVIEW_HOVER_DELAY_MS = 1000;
const DAY_PREVIEW_CLOSE_DELAY_MS = 250;
const DAY_PREVIEW_LONG_PRESS_DELAY_MS = 500;

export function CalendarSurface({
  activeTab,
  month,
  selectedDay,
  viewMode,
  onMonthChange,
  onViewModeChange,
  onSelectedDayChange,
  onPlannerMutation,
  duoScope = "me",
  partnerCompletionMarkersByDate,
  partnerOverlayError,
}: CalendarSurfaceProps) {
  const [context, setContext] = useState<PlannerContextPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(allCategoriesValue);
  const [endMonthFilter, setEndMonthFilter] = useState<string | null>(null);
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
  const isDayPreviewSurfaceTarget = (target: Element) =>
    Boolean(target.closest('[data-day-cell="true"]')) ||
    Boolean(dayPreviewRef.current?.contains(target));

  useEffect(() => {
    draftPolicyRef.current = draftPolicy;
  }, [draftPolicy]);

  const loadContext = useCallback(
    async ({
      showLoading = true,
      toastOnError = false,
      forcePrepare = false,
    }: {
      showLoading?: boolean;
      toastOnError?: boolean;
      forcePrepare?: boolean;
    } = {}) => {
    if (activeTab !== "calendar") {
      return false;
    }

    let shouldShowLoading = showLoading;
    if (shouldShowLoading) {
      setError(null);
    }
    if (!month) {
      const resolvedMonth = getMonthInTimezone(setupTimezone);
      onMonthChange(resolvedMonth, "replace");
      return true;
    }

    const plannerContextCacheKey = `${PLANNER_CONTEXT_CACHE_PREFIX}${month}`;
    const cachedContextPayload = readTabDataCache<PlannerContextPayload>(plannerContextCacheKey);
    if (cachedContextPayload) {
      setContext(cachedContextPayload);
      if (cachedContextPayload.preferences?.timezone) {
        const policyForSetup =
          draftPolicyRef.current ?? cachedContextPayload.preferences.defaultPolicy;
        setSetupTimezone(cachedContextPayload.preferences.timezone);
        setSetupWeekStartsOn(
          normalizeWeekStartsOn(policyForSetup.weekStartsOn)
        );
        setSetupRestWeekdays(policyForSetup.restWeekdays);
      }
      shouldShowLoading = false;
    }

    if (shouldShowLoading) {
      setLoading(true);
    }
    let contextPayload: PlannerContextPayload;
    try {
      const parsedMonth = parseMonth(month);
      const visibleStart = getScopeDateRange(
        format(addMonths(parsedMonth, -1), "yyyy-MM")
      ).start;
      const visibleEnd = getScopeDateRange(
        format(addMonths(parsedMonth, 1), "yyyy-MM")
      ).end;
      const shouldPrepare = forcePrepare || !calendarPreparedRef.current;
      contextPayload = shouldPrepare
        ? await postJson<PlannerContextPayload>("/api/planner/prepare", {
            scopeMonth: month,
            visibleStart,
            visibleEnd,
          })
        : await getJson<PlannerContextPayload>("/api/planner/context", {
            query: {
              scopeMonth: month,
              visibleStart,
              visibleEnd,
            },
          });
      calendarPreparedRef.current = true;
    } catch (error) {
      if (shouldShowLoading) {
        setLoading(false);
      }
      const message = getApiErrorMessage(
        error,
        "Planner calendar context could not be loaded."
      );
      if (shouldShowLoading) {
        setContext(null);
        setError(message);
      }
      if (toastOnError) {
        toast.error(message);
      }
      return false;
    }
    if (shouldShowLoading) {
      setLoading(false);
    }
    if (!contextPayload) {
      const message = "Planner calendar context could not be loaded.";
      if (shouldShowLoading) {
        setContext(null);
        setError(message);
      }
      if (toastOnError) {
        toast.error(message);
      }
      return false;
    }

    setContext(contextPayload);
    writeTabDataCache(plannerContextCacheKey, contextPayload);
    if (contextPayload.preferences?.timezone) {
      const policyForSetup =
        draftPolicyRef.current ?? contextPayload.preferences.defaultPolicy;
      setSetupTimezone(contextPayload.preferences.timezone);
      setSetupWeekStartsOn(
        normalizeWeekStartsOn(policyForSetup.weekStartsOn)
      );
      setSetupRestWeekdays(policyForSetup.restWeekdays);
    }
    return true;
  }, [activeTab, month, onMonthChange, setupTimezone]);

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
    todayMonth,
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
    partnerCompletionMarkersByDate,
    previewEntryOrderByDay,
    additionalProjectionDays,
  });
  const {
    cells,
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
        getEntryDisplayTitleWithTime,
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
    canResetViewWindow,
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

  useOutsidePointerDismiss({
    enabled: Boolean(dayPreview?.pinned),
    containerRef: dayPreviewRef,
    onDismiss: () => {
      setDayPreview(null);
    },
    shouldIgnoreTarget: isDayPreviewSurfaceTarget,
  });

  const submitSetup = async () => {
    if (!isValidIanaTimezone(setupTimezone)) {
      toast.error("Provide a valid IANA timezone.");
      return;
    }

    setSetupLoading(true);
    const defaultPolicy = createDefaultPlannerPolicy(
      setupTimezone,
      new Date().toISOString()
    );
    defaultPolicy.restWeekdays = [...setupRestWeekdays].sort((a, b) => a - b);
    defaultPolicy.weekStartsOn = normalizeWeekStartsOn(setupWeekStartsOn);

    try {
      await putJson<
        { message?: string; preferences?: PlannerPreferencesPayload["preferences"] },
        {
          timezone: string;
          defaultPolicy: PlannerPolicy;
        }
      >("/api/planner/context", {
        timezone: setupTimezone,
        defaultPolicy,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Planner setup could not be saved."));
      setSetupLoading(false);
      return;
    }
    setSetupLoading(false);

    handlePlannerMutation();
    setDraftPolicy(null);
    setDraftPreview(null);
    setDraftPreviewWindow(null);
    dispatchDraftCommand({ type: "clear" });
    setSettingsOpen(false);
    if (!month) {
      onMonthChange(getMonthInTimezone(setupTimezone), "replace");
    } else {
      await loadContext();
    }
    toast.success("Planner setup saved.");
  };

  const requestPreviewForWindow = useCallback(
    async ({
      startDate,
      endDate,
      nextPolicy,
      solveIntent,
      draftCommands,
      recoverPastPlacements = false,
    }: {
      startDate: string;
      endDate: string;
      nextPolicy: PlannerPolicy;
      solveIntent: "stable" | "replan";
      draftCommands: PlannerDraftCommand[];
      recoverPastPlacements?: boolean;
    }) => {
      if (!context?.timezone) {
        throw new Error("Planner context is unavailable.");
      }
      try {
        const previewPayload = await postJson<PlannerPreviewResponsePayload>(
          "/api/planner/context",
          {
            startDate,
            endDate,
            timezone: context.timezone,
            policy: nextPolicy,
            source: context.activePlan ? "update" : "manual",
            solveIntent,
            draftCommands,
            recoverPastPlacements,
          }
        );
        return previewPayload.preview;
      } catch (error) {
        throw new Error(getApiErrorMessage(error, "Preview refresh failed."));
      }
    },
    [context]
  );

  const requestPreview = async (
    nextPolicy: PlannerPolicy,
    solveIntent: "stable" | "replan",
    draftCommands: PlannerDraftCommand[]
  ) => {
    const window = draftSaveWindow;
    if (!window) {
      throw new Error(
        plannerDraftWindowUnavailableMessage(draftSaveWindowResult)
      );
    }
    return requestPreviewForWindow({
      startDate: window.start,
      endDate: window.end,
      nextPolicy,
      solveIntent,
      draftCommands,
    });
  };

  /**
   * The only way a preview becomes the draft. `replan` results deliberately do
   * not come through here: they are proposals, and the save route always solves
   * `stable`, so storing one would hand the user a draft that cannot publish.
   */
  const draftSaveCommandsRef = useRef(draftSaveCommands);
  useEffect(() => {
    draftSaveCommandsRef.current = draftSaveCommands;
  }, [draftSaveCommands]);
  const refreshDraftPreview = async (nextPolicy: PlannerPolicy) => {
    const preview = await requestPreview(
      nextPolicy,
      "stable",
      draftSaveCommandsRef.current
    );
    if (preview) {
      setDraftPreview(preview);
      if (draftSaveWindow) {
        setDraftPreviewWindow({
          start: draftSaveWindow.start,
          end: draftSaveWindow.end,
        });
      }
    }
    return preview;
  };

  /**
   * Ask the solver where things would go under `nextPolicy` when policy cost
   * outranks stability, then record the differences as `move_item` commands.
   *
   * The proposal is scratch: it is never stored as the draft. Only the pins it
   * produces persist, which is what makes a coach change survive the next
   * recompute instead of evaporating on the following stable solve.
   *
   * Existing pins are kept, not released, so a policy change reshuffles what
   * the user has not placed by hand and leaves deliberate placements alone.
   */
  const applyPolicyReplanMoves = async (nextPolicy: PlannerPolicy) => {
    if (!context?.scopeMonth || !effectivePreview) {
      return { moveCount: 0, movedEntryKeys: [] as string[] };
    }
    const priorCommands = draftSaveCommandsRef.current;
    const proposal = await requestPreview(nextPolicy, "replan", priorCommands);
    if (!proposal) {
      return { moveCount: 0, movedEntryKeys: [] as string[] };
    }
    const baselineDateByEntryKey = new Map(
      effectivePreview.workUnits.map((unit) => [
        draftCommandEntryKey({
          goalId: unit.originalGoalId,
          unitKey: unit.unitKey,
        }),
        unit.scheduledDate,
      ])
    );
    const baselineUnitByEntryKey = new Map(
      effectivePreview.workUnits.map((unit) => [
        draftCommandEntryKey({
          goalId: unit.originalGoalId,
          unitKey: unit.unitKey,
        }),
        unit,
      ])
    );

    let nextState = draftCommandState;
    const pendingActions: Array<{
      type: "upsert_move";
      goalId: string;
      unitKey: string;
      scheduledDate: string;
      sourceDate: string;
    }> = [];
    const movedEntryKeys: string[] = [];
    for (const unit of proposal.workUnits) {
      const entryKey = draftCommandEntryKey({
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
      });
      const nextDate = unit.scheduledDate;
      if (nextDate === null || baselineDateByEntryKey.get(entryKey) === nextDate) {
        continue;
      }
      const baselineUnit = baselineUnitByEntryKey.get(entryKey);
      if (
        shouldBlockAutomatedReplanMoveForEntry({
          baselineClassification: baselineUnit?.classification,
          baselineScheduledDate: baselineUnit?.scheduledDate,
          asOfDate: context.asOfDate,
        })
      ) {
        continue;
      }
      const action = {
        type: "upsert_move" as const,
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
        scheduledDate: nextDate,
        sourceDate: baselineDateByEntryKey.get(entryKey) ?? nextDate,
      };
      nextState = draftCommandReducer(nextState, action);
      pendingActions.push(action);
      movedEntryKeys.push(entryKey);
    }

    if (pendingActions.length > 0) {
      const prospectiveWindow = tryBuildPlannerDraftSaveWindow({
        currentMonth: context.scopeMonth,
        commands: selectDraftCommands(nextState),
        workUnits: draftWindowWorkUnits,
      });
      if (!prospectiveWindow.ok) {
        if (prospectiveWindow.code === "too_wide") {
          toast.error(PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE);
        } else {
          toast.error("Those session moves cannot fit in the current draft window.");
        }
        return { moveCount: 0, movedEntryKeys: [] as string[] };
      }
      for (const action of pendingActions) {
        dispatchDraftCommand(action);
      }
    }

    // Keep the ref ahead of the reducer so the stable refresh that follows
    // sends the pins we just created rather than the previous render's list.
    draftSaveCommandsRef.current = sortPlannerDraftCommands(
      selectDraftCommands(nextState)
    );
    return { moveCount: movedEntryKeys.length, movedEntryKeys };
  };

  /**
   * Ask the solver where uncredited sessions whose date has already passed
   * would go if it were free to re-place them, then record the differences as
   * `move_item` commands so the user reviews and saves them like any other
   * draft change.
   *
   * Two solves over the same window: a plain one for the baseline, and the
   * recovery one. Diffing them is what identifies a session as recovered rather
   * than merely late, and it keeps the flow on the existing preview/save path
   * instead of introducing a second write surface for past dates.
   */
  const recoverPastSessions = async () => {
    if (recoverLoading) {
      return;
    }
    if (!context?.scopeMonth || !context.asOfDate) {
      toast.error("Planner context is unavailable.");
      return;
    }
    const policy = effectiveDraftPolicy ?? context.preferences?.defaultPolicy ?? null;
    if (!policy) {
      toast.error("Confirm planner settings before recovering past sessions.");
      return;
    }

    setRecoverLoading(true);
    try {
      const window = buildPlannerRecoveryWindow(context.asOfDate);
      const priorCommands = draftSaveCommandsRef.current;
      const [baseline, recovered] = await Promise.all([
        requestPreviewForWindow({
          startDate: window.start,
          endDate: window.end,
          nextPolicy: policy,
          solveIntent: "stable",
          draftCommands: priorCommands,
        }),
        requestPreviewForWindow({
          startDate: window.start,
          endDate: window.end,
          nextPolicy: policy,
          solveIntent: "stable",
          draftCommands: priorCommands,
          recoverPastPlacements: true,
        }),
      ]);
      if (!baseline || !recovered) {
        toast.error("Recovery preview returned no planner data.");
        return;
      }

      const plan = buildPlannerRecoveryPlan({
        baselineUnits: baseline.workUnits,
        recoveredUnits: recovered.workUnits,
        asOfDate: context.asOfDate,
      });
      if (plan.moves.length === 0) {
        toast(describePlannerRecoveryOutcome(plan));
        return;
      }

      let nextState = draftCommandState;
      const pendingActions = plan.moves.map((move) => ({
        type: "upsert_move" as const,
        goalId: move.goalId,
        unitKey: move.unitKey,
        scheduledDate: move.scheduledDate,
        sourceDate: move.sourceDate,
      }));
      for (const action of pendingActions) {
        nextState = draftCommandReducer(nextState, action);
      }

      const prospectiveWindow = tryBuildPlannerDraftSaveWindow({
        currentMonth: context.scopeMonth,
        commands: selectDraftCommands(nextState),
        workUnits: draftWindowWorkUnits,
      });
      if (!prospectiveWindow.ok) {
        toast.error(
          prospectiveWindow.code === "too_wide"
            ? PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
            : "Those recovered sessions cannot fit in a single draft window."
        );
        return;
      }

      for (const action of pendingActions) {
        dispatchDraftCommand(action);
      }
      // Keep the ref ahead of the reducer so the stable refresh below sends the
      // pins we just created rather than the previous render's list.
      draftSaveCommandsRef.current = sortPlannerDraftCommands(
        selectDraftCommands(nextState)
      );
      await refreshDraftPreview(policy);
      toast.success(describePlannerRecoveryOutcome(plan));
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Past sessions could not be recovered.")
      );
    } finally {
      setRecoverLoading(false);
    }
  };

  const clearDraftMoveCommands = (entryKeys: string[]) => {
    if (!context?.scopeMonth || entryKeys.length === 0) {
      return;
    }
    let nextState = draftCommandState;
    for (const entryKey of entryKeys) {
      const separatorIndex = entryKey.indexOf(":");
      const action = {
        type: "remove_kind",
        kind: "move_item",
        goalId: entryKey.slice(0, separatorIndex),
        unitKey: entryKey.slice(separatorIndex + 1),
      } as const;
      dispatchDraftCommand(action);
      nextState = draftCommandReducer(nextState, action);
    }
    draftSaveCommandsRef.current = sortPlannerDraftCommands(
      selectDraftCommands(nextState)
    );
  };

  const nonPublishablePreviewMessage = useCallback(
    (preview: NonNullable<PlannerContextPayload["preview"]>) =>
      getNonPublishablePreviewMessage({
        preview,
        context,
        draftSaveWindow,
      }),
    [context, draftSaveWindow]
  );
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

  const clearHoverPreviewTimer = useCallback(() => {
    if (hoverPreviewTimerRef.current) {
      window.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = null;
    }
  }, []);

  const clearHoverPreviewCloseTimer = useCallback(() => {
    if (hoverPreviewCloseTimerRef.current) {
      window.clearTimeout(hoverPreviewCloseTimerRef.current);
      hoverPreviewCloseTimerRef.current = null;
    }
  }, []);

  const scheduleHoverPreviewClose = useCallback((day: string) => {
    clearHoverPreviewCloseTimer();
    hoverPreviewCloseTimerRef.current = window.setTimeout(() => {
      setDayPreview((current) => {
        if (!current || current.pinned || current.day !== day) {
          return current;
        }
        if (pointerInsideDayPreviewRef.current) {
          return current;
        }
        return null;
      });
    }, DAY_PREVIEW_CLOSE_DELAY_MS);
  }, [clearHoverPreviewCloseTimer]);

  useEffect(() => {
    if (!dayPreview || dayPreview.pinned) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (isDayPreviewSurfaceTarget(target)) {
        return;
      }
      pointerInsideDayPreviewRef.current = false;
      scheduleHoverPreviewClose(dayPreview.day);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [dayPreview, scheduleHoverPreviewClose]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openDayPreview = ({
    day,
    pinned,
    target,
  }: {
    day: string;
    pinned: boolean;
    target: EventTarget & HTMLElement;
  }) => {
    const rect = target.getBoundingClientRect();
    const position = computeDayPreviewPosition({
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setDayPreview({ day, position, pinned });
  };

  const openMoveDialogForDay = useCallback((day: string) => {
    setExpandedPreviewDay(null);
    setDayPreview(null);
    setMoveDialogDay(day);
    setMoveDialogSourceEntryKey("");
  }, []);

  const openDayViewForDay = useCallback(
    (day: string) => {
      setExpandedPreviewDay(null);
      setMoveDialogDay(null);
      setSelectedEventEntryKey(null);
      setLocalSelectedDay(day);
      onSelectedDayChange(day, "push", "day");
      setDayPreview(null);
    },
    [onSelectedDayChange]
  );

  const shouldSuppressDayCellClick = (day: string) => {
    const suppression = suppressDayCellClickRef.current;
    if (!suppression) {
      return false;
    }
    if (suppression.day !== day) {
      return false;
    }
    if (suppression.active) {
      suppressDayCellClickRef.current = null;
      return true;
    }
    return false;
  };

  const scheduleHoverPreview = (
    day: string,
    target: EventTarget & HTMLElement
  ) => {
    if (dayPreview?.pinned || pointerPressActiveRef.current) {
      return;
    }
    clearHoverPreviewCloseTimer();
    clearHoverPreviewTimer();
    hoverPreviewTimerRef.current = window.setTimeout(() => {
      if (pointerPressActiveRef.current) {
        return;
      }
      openDayPreview({ day, pinned: false, target });
    }, DAY_PREVIEW_HOVER_DELAY_MS);
  };

  const handleDayCellClick = (
    day: string,
    target: EventTarget & HTMLElement
  ) => {
    if (shouldSuppressDayCellClick(day)) {
      suppressDayCellClickRef.current = null;
      return;
    }
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (dayPreview?.pinned && dayPreview.day === day) {
      setDayPreview(null);
      return;
    }
    clearHoverPreviewTimer();
    openDayPreview({ day, pinned: true, target });
  };

  const startLongPressPreview = (
    day: string,
    target: EventTarget & HTMLElement
  ) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      openDayPreview({ day, pinned: true, target });
    }, DAY_PREVIEW_LONG_PRESS_DELAY_MS);
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
    getEntryDisplayTitleWithTime,
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
      openDayPreview({
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
      setDraftPreview,
      setDraftPreviewWindow,
      requestPreviewForWindow,
      coachActions: coach.actions,
    });

  const showBlockingLoading = loading && context === null;
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
    const baseDay = parse(resolvedFocusedDay, "yyyy-MM-dd", new Date());
    const nextDay = format(addDays(baseDay, direction * stepDays), "yyyy-MM-dd");
    onSelectedDayChange(nextDay, "push", viewMode);
  };
  const resetViewWindow = () => {
    if (viewMode === "month") {
      onMonthChange(todayMonth, "replace");
      return;
    }
    onSelectedDayChange(calendarToday, "replace", viewMode);
  };
  const setCalendarViewMode = (nextViewMode: PlannerCalendarViewMode) => {
    if (nextViewMode === viewMode) {
      return;
    }
    setDayPreview(null);
    onViewModeChange(nextViewMode, "push");
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
    clearHoverPreviewTimer,
    clearHoverPreviewCloseTimer,
    clearLongPressTimer,
    openDayPreview,
    handleDayCellClick,
    openDayViewForDay,
    scheduleHoverPreview,
    scheduleHoverPreviewClose,
    startLongPressPreview,
    pointerPressActiveRef,
    longPressTriggeredRef,
    lastTouchTapRef,
    suppressDayCellClickRef,
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
        onSave={savePlan}
        onDiscardDraftChanges={discardDraftChanges}
        onViewModeChange={setCalendarViewMode}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
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
              canResetViewWindow={canResetViewWindow}
              viewDescription={viewDescription}
              expandedMonthRows={expandedMonthRows}
              onMoveViewWindow={moveViewWindow}
              onToggleExpandedMonthRows={() =>
                setExpandedMonthRows((current) => !current)
              }
              onResetViewWindow={resetViewWindow}
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
                } ${viewMode === "month" ? "min-h-[34rem]" : "min-h-[26rem]"}`}
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
                        getEntryDisplayTitle={getEntryDisplayTitleWithTime}
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
                      <div className="mt-2 grid min-w-[calc(7*((100%-1rem)/3))] grid-cols-[repeat(7,minmax(0,calc((100%-1rem)/3)))] gap-2 md:min-w-0 md:grid-cols-7">
                        {(viewMode === "week" ? focusedWeekCells : cells).map(
                          renderCalendarDayCell
                        )}
                      </div>
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
                    getEntryDisplayTitle={getEntryDisplayTitleWithTime}
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
            getEntryDisplayTitle={getEntryDisplayTitleWithTime}
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
            getEntryDisplayTitleWithTime={getEntryDisplayTitleWithTime}
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
