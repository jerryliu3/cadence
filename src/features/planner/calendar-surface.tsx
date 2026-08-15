"use client";

import { addDays, addMonths, format, isValid, parse } from "date-fns";
import {
  CalendarDays,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Settings,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { AnchoredPopupCard } from "@/components/ui/anchored-popup-card";
import { Button } from "@/components/ui/button";
import { CompletionToggle } from "@/components/ui/completion-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingCard } from "@/components/ui/loading-card";
import { PeriodStepper } from "@/components/ui/period-stepper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildActiveGoalIndexes } from "@/features/planner/calendar-entries";
import {
  buildWeekdayLabels,
  completionDisabledReasonCopy,
  getEntryDraftDiffSummary,
  getDayStatus,
  getEntryDisplayTitle,
  getEntrySubtitle,
  getMonthInTimezone,
  isEntryCredited,
  isEntryImmovableForDraft,
  monthToLabel,
  normalizeWeekStartsOn,
  parseMonth,
  restWeekdayOptions,
} from "@/features/planner/calendar-format";
import {
  type PlannerDragTarget,
  PlannerDndProvider,
} from "@/features/planner/calendar-dnd";
import { CalendarDayPreviewList } from "@/features/planner/calendar-day-preview-list";
import { CalendarMonthDayCell } from "@/features/planner/calendar-month-day-cell";
import { PlannerCoachPanel } from "@/features/planner/coach/planner-coach-panel";
import { usePlannerCoach } from "@/features/planner/coach/use-planner-coach";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";
import {
  draftCommandReducer,
  initialDraftCommandState,
  selectDraftCommands,
} from "@/features/planner/draft-command-reducer";
import { getDateFactDispatchForEntry as resolveDateFactDispatchForEntry } from "@/features/planner/completion-entry-dispatch";
import { planDraftMove } from "@/features/planner/plan-draft-move";
import { planDraftTimeOverrideUpdate } from "@/features/planner/draft-time-override";
import { reorderPreviewEntryKeys } from "@/features/planner/reorder-preview-entries";
import { computeDayPreviewPosition } from "@/features/planner/day-preview-popup";
import { getGoalVisual } from "@/features/planner/goal-visuals";
import {
  readPlannerCalendarDayProjection,
  selectPlannerCalendarDayProjectionsByDay,
  selectPlannerCalendarStoreProjection,
} from "@/features/planner/calendar-store-selectors";
import { selectCalendarViewWindowProjection } from "@/features/planner/calendar-view-projection";
import {
  getDateInTimezone,
  isValidIanaTimezone,
  resolveUserTimezone,
} from "@/lib/dates/timezone";
import {
  getApiErrorMessage,
  isApiClientError,
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
import type { EligibilityReason } from "@/lib/planner/eligibility";
import {
  draftCommandEntryKey,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import {
  PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE,
  tryBuildPlannerDraftSaveWindow,
  plannerDraftWindowUnavailableMessage,
} from "@/lib/planner/draft-window";
import {
  getScopeDateRange,
  getWindowState,
} from "@/lib/planner/dates";
import { buildPlannerSaveRequestBody } from "@/features/planner/planner-save-request";
import {
  createDefaultPlannerPolicy,
  type PlannerPolicy,
} from "@/lib/planner/policy";
import { shouldUseDirectDraftPersistence } from "@/lib/planner/save-persistence";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";
import { captureViewportRect } from "@/lib/xp/events";
import { mergeCompletionFactMarkers } from "@cadence/shared/planner/partner-completion";
import type {
  CalendarSurfaceProps,
  CompletionControlDisabledReason,
  DayPreviewState,
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerErrorPayload,
  PlannerPreferencesPayload,
  PlannerPreviewResponsePayload,
} from "@/features/planner/calendar-surface.types";
import { ROLLING_WEEK_GRID_WIDTH_BY_VIEW } from "@/features/planner/calendar-rolling-week-width";
const DAY_PREVIEW_HOVER_DELAY_MS = 1000;
const DAY_PREVIEW_CLOSE_DELAY_MS = 250;
const DAY_PREVIEW_LONG_PRESS_DELAY_MS = 500;
const MAX_MONTH_HEADING_SAMPLE = "September 2026";
const MAX_WEEK_HEADING_SAMPLE = "Sep 30 - Sep 30, 2026";
const MAX_THREE_DAY_HEADING_SAMPLE = "Sep 30 - Oct 2, 2026";
const MAX_DAY_HEADING_SAMPLE = "Wed Aug 30";
const ROLLING_WEEK_GRID_LABELS_BASE_CLASS =
  "grid min-w-[calc(7*var(--rolling-week-cell-width))] grid-cols-[repeat(7,minmax(0,var(--rolling-week-cell-width)))] gap-2 text-center text-xs text-muted-foreground";
const ROLLING_WEEK_GRID_CELLS_BASE_CLASS =
  "mt-2 grid min-w-[calc(7*var(--rolling-week-cell-width))] grid-cols-[repeat(7,minmax(0,var(--rolling-week-cell-width)))] gap-2";
const SCOPE_ONLY_ELIGIBILITY_REASONS = new Set([
  "end_outside_scope",
  "starts_after_scope",
]);
const ELIGIBILITY_REASON_LABELS: Record<EligibilityReason, string> = {
  eligible: "This goal can be planned.",
  not_owner: "Only goals you own can be planned here.",
  deleted: "Deleted goals are excluded from planning.",
  archived: "Archived goals are excluded from planning.",
  linked: "Linked goals are managed by their source relationship.",
  missing_end_date:
    "This goal needs a deadline before it can be planned in Calendar.",
  invalid_date_range: "The goal dates are invalid (start is after end).",
  end_outside_scope: "This goal ends before the selected planning month.",
  starts_after_scope: "This goal starts after the selected planning month.",
  horizon_too_long:
    "This goal deadline exceeds the 24-month planning horizon limit.",
};

function getEligibilityReasonLabel(reason: EligibilityReason) {
  return ELIGIBILITY_REASON_LABELS[reason];
}

const PLANNER_VIEW_MODES = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "three_day", label: "3 Day" },
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
  duoScope = "me",
  partnerCompletionMarkersByDate,
  partnerOverlayError,
}: CalendarSurfaceProps) {
  const [context, setContext] = useState<PlannerContextPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [rebuildLoading, setRebuildLoading] = useState(false);
  const [fullResetLoading, setFullResetLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [draggingEntryKey, setDraggingEntryKey] = useState<string | null>(null);
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
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const hoverPreviewCloseTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerPressActiveRef = useRef(false);
  const pointerInsideDayPreviewRef = useRef(false);
  const calendarPreparedRef = useRef(false);
  const dayPreviewRef = useRef<HTMLDivElement | null>(null);
  const rollingWeekStripRef = useRef<HTMLDivElement | null>(null);
  const isDayPreviewSurfaceTarget = (target: Element) =>
    Boolean(target.closest('[data-day-cell="true"]')) ||
    Boolean(dayPreviewRef.current?.contains(target));

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
        setSetupTimezone(cachedContextPayload.preferences.timezone);
        setSetupWeekStartsOn(
          normalizeWeekStartsOn(cachedContextPayload.preferences.defaultPolicy.weekStartsOn)
        );
        setSetupRestWeekdays(cachedContextPayload.preferences.defaultPolicy.restWeekdays);
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

    setContext(contextPayload);
    writeTabDataCache(plannerContextCacheKey, contextPayload);
    if (contextPayload.preferences?.timezone) {
      setSetupTimezone(contextPayload.preferences.timezone);
      setSetupWeekStartsOn(
        normalizeWeekStartsOn(contextPayload.preferences.defaultPolicy.weekStartsOn)
      );
      setSetupRestWeekdays(contextPayload.preferences.defaultPolicy.restWeekdays);
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

  const weekStartsOn = normalizeWeekStartsOn(
    context?.preferences?.defaultPolicy.weekStartsOn
  );
  const calendarToday =
    context?.asOfDate ??
    getDateInTimezone(new Date(), context?.timezone ?? setupTimezone);
  const {
    cells,
    focusedDay,
    focusedWeekDays,
    focusedWeekCells,
    focusedThreeDayDays,
    visibleDays,
  } =
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
  const handlePlannerMutation = useCallback(() => {
    invalidatePlannerRelatedTabCaches();
    onPlannerMutation();
  }, [onPlannerMutation]);
  const currentScopeMonth = month ?? context?.scopeMonth ?? null;
  const clearDraftSession = useCallback(() => {
    setDraftPolicy(null);
    setDraftPreview(null);
    setDraftPreviewWindow(null);
    dispatchDraftCommand({
      type: "clear",
    });
  }, []);
  const effectiveDraftPolicy = draftPolicy;
  const effectivePreview = draftPreview ?? context?.preview ?? null;
  const draftSaveCommands = useMemo(
    () => sortPlannerDraftCommands(selectDraftCommands(draftCommandState)),
    [draftCommandState]
  );
  const hasDraftSession =
    draftSaveCommands.length > 0 || effectiveDraftPolicy !== null;
  const draftWindowWorkUnits = useMemo(
    () => [
      ...(context?.preview?.workUnits ?? []),
      ...(effectivePreview?.workUnits ?? []),
    ],
    [
      context?.preview?.workUnits,
      effectivePreview?.workUnits,
    ]
  );
  const draftWindowUnitByEntryKey = useMemo(
    () => {
      const units = new Map<string, (typeof draftWindowWorkUnits)[number]>();
      for (const unit of draftWindowWorkUnits) {
        const key = draftCommandEntryKey({
          goalId: unit.originalGoalId,
          unitKey: unit.unitKey,
        });
        const existing = units.get(key);
        if (existing?.scheduledDate && !unit.scheduledDate) {
          continue;
        }
        units.set(key, unit);
      }
      return units;
    },
    [draftWindowWorkUnits]
  );
  const draftSaveWindowResult = useMemo(() => {
    if (!currentScopeMonth) {
      return { ok: false as const, code: "empty" as const };
    }
    return tryBuildPlannerDraftSaveWindow({
      currentMonth: currentScopeMonth,
      commands: draftSaveCommands,
      workUnits: draftWindowWorkUnits,
    });
  }, [currentScopeMonth, draftSaveCommands, draftWindowWorkUnits]);
  const draftSaveWindow = draftSaveWindowResult.ok
    ? draftSaveWindowResult.window
    : null;
  const draftWindowTooWide =
    !draftSaveWindowResult.ok && draftSaveWindowResult.code === "too_wide";
  const horizonCounter = useMemo(() => {
    const summary = effectivePreview?.horizonSummary ?? [];
    if (summary.length === 0) {
      return null;
    }
    const total = summary.reduce((count, goal) => count + goal.totalCount, 0);
    if (total <= 0) {
      return null;
    }
    const thisWindow = summary.reduce(
      (count, goal) => count + goal.windowPlannedCount,
      0
    );
    const remaining = summary.reduce(
      (count, goal) => count + goal.remainingCount,
      0
    );
    return { thisWindow, total, remaining };
  }, [effectivePreview?.horizonSummary]);
  const eligibilityNotices = useMemo(() => {
    const eligibilityEntries = effectivePreview?.eligibility ?? [];
    if (eligibilityEntries.length === 0) {
      return { hardIneligible: [] as Array<{ goalId: string; goalTitle: string; reasonCopy: string }>, scopeOnlyCount: 0 };
    }

    const hardIneligible: Array<{
      goalId: string;
      goalTitle: string;
      reasonCopy: string;
    }> = [];
    let scopeOnlyCount = 0;

    for (const eligibilityEntry of eligibilityEntries) {
      if (eligibilityEntry.eligible) {
        continue;
      }
      if (SCOPE_ONLY_ELIGIBILITY_REASONS.has(eligibilityEntry.reason)) {
        scopeOnlyCount += 1;
        continue;
      }
      hardIneligible.push({
        goalId: eligibilityEntry.goalId,
        goalTitle:
          context?.goalTitles?.[eligibilityEntry.goalId] ?? eligibilityEntry.goalId,
        reasonCopy: getEligibilityReasonLabel(eligibilityEntry.reason),
      });
    }

    hardIneligible.sort((left, right) =>
      left.goalTitle.localeCompare(right.goalTitle)
    );
    return { hardIneligible, scopeOnlyCount };
  }, [context?.goalTitles, effectivePreview?.eligibility]);
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
        draftCommandState,
        activeGoalsByPlanGoalId,
        activeGoalsByOriginalGoalId,
      }),
    [
      activeGoalsByOriginalGoalId,
      activeGoalsByPlanGoalId,
      context,
      draftCommandState,
      effectivePreview,
    ]
  );
  const {
    effectiveDraftItemEdits,
    entriesByDate,
    entryByKey,
    entryDayByKey,
    unplaceableGoalSummaries,
    totalUnplacedCount,
  } = calendarStoreProjection;
  const primaryUnplaceableGoal = unplaceableGoalSummaries[0] ?? null;
  const unplaceablePrimaryActionLabel =
    unplaceableGoalSummaries.length > 1 ? "Review first goal" : "Edit this goal";
  const invalidLockGoalCount = unplaceableGoalSummaries.filter(
    (entry) => entry.reason === "invalid_lock"
  ).length;
  const effectiveSelectedDay = localSelectedDay;
  const dayPreviewDay = dayPreview?.day ?? null;
  const projectionDays = useMemo(() => {
    const days = new Set<string>();
    for (const day of visibleDays) {
      days.add(day);
    }
    if (effectiveSelectedDay) {
      days.add(effectiveSelectedDay);
    }
    if (focusedDay) {
      days.add(focusedDay);
    }
    if (dayPreviewDay) {
      days.add(dayPreviewDay);
    }
    return Array.from(days);
  }, [dayPreviewDay, effectiveSelectedDay, focusedDay, visibleDays]);
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
  const hideViewerPlan = duoScope === "partner";
  const plannerReadOnly = duoScope === "partner";
  const getEntriesForDay = useCallback(
    (day: string | null) =>
      hideViewerPlan ? [] : getCalendarDayProjection(day).entries,
    [getCalendarDayProjection, hideViewerPlan]
  );
  const getCompletionFactMarkersForDay = useCallback(
    (day: string | null) => {
      const viewerMarkers = hideViewerPlan
        ? []
        : getCalendarDayProjection(day).completionFactMarkers;
      const partnerMarkers =
        day && (duoScope === "partner" || duoScope === "both")
          ? partnerCompletionMarkersByDate?.get(day) ?? []
          : [];
      return mergeCompletionFactMarkers(viewerMarkers, partnerMarkers);
    },
    [
      duoScope,
      getCalendarDayProjection,
      hideViewerPlan,
      partnerCompletionMarkersByDate,
    ]
  );
  const getOrderedEntriesForDay = useCallback(
    (day: string | null) =>
      hideViewerPlan ? [] : getCalendarDayProjection(day).orderedEntries,
    [getCalendarDayProjection, hideViewerPlan]
  );

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
    ? draftWindowUnitByEntryKey.get(selectedEventEntry.key) ?? null
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
    }: {
      startDate: string;
      endDate: string;
      nextPolicy: PlannerPolicy;
      solveIntent: "stable" | "replan";
      draftCommands: PlannerDraftCommand[];
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
    (preview: NonNullable<PlannerContextPayload["preview"]>) => {
      if (
        context &&
        draftSaveWindow &&
        getWindowState(draftSaveWindow, context.asOfDate) === "historical"
      ) {
        return "Publishing an elapsed window is not supported. Publish a window that includes today or a future date.";
      }
      if (preview.solver.issueCodes.includes("invalid_lock")) {
        const affectedGoals = preview.solver.invalidGoalIds
          .slice(0, 3)
          .map((goalId) => context?.goalTitles?.[goalId] ?? goalId);
        const affectedLabel =
          affectedGoals.length > 0
            ? `Affected goals: ${affectedGoals.join(", ")}. `
            : "";
        return `${affectedLabel}Locked sessions currently conflict with this regenerated preview. Unlock affected sessions, regenerate, then save.`;
      }
      if (preview.solver.issueCodes.length > 0) {
        return `Resolve planner issues before saving: ${preview.solver.issueCodes.join(
          ", "
        )}.`;
      }
      return "This preview is not savable yet. Regenerate and resolve planner issues before saving.";
    },
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
  const coach = usePlannerCoach({
    activeTab,
    context,
    entriesByDate,
    effectivePreview,
    effectiveDraftPolicy,
    hasDraftSession,
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

  const moveConflictByGoalDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const unit of draftWindowWorkUnits) {
      const entryKey = draftCommandEntryKey({
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
      });
      const editedDate = effectiveDraftItemEdits[entryKey]?.scheduledDate;
      const day = editedDate === undefined ? unit.scheduledDate : editedDate;
      if (!day) {
        continue;
      }
      const key = `${unit.originalGoalId}:${day}`;
      const existing = map.get(key) ?? new Set<string>();
      existing.add(entryKey);
      map.set(key, existing);
    }
    return map;
  }, [draftWindowWorkUnits, effectiveDraftItemEdits]);
  const moveCompletionConflictByGoalDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const unit of draftWindowWorkUnits) {
      if (!unit.creditedCompletionDate) {
        continue;
      }
      map.set(
        `${unit.originalGoalId}:${unit.creditedCompletionDate}`,
        unit.unitKey
      );
    }
    return map;
  }, [draftWindowWorkUnits]);
  const scopeMonth = context?.scopeMonth ?? null;

  const queueDraftMoveCommand = useCallback(
    ({
      entry,
      nextDate,
      source,
    }: {
      entry: PlannerDayDetailEntry;
      nextDate: string;
      source: "date_input" | "drag_drop" | "coach";
    }) => {
      if (!scopeMonth) {
        return false;
      }
      const normalizedDate = nextDate.trim();
      const baselineUnit = draftWindowUnitByEntryKey.get(entry.key);
      const completionConflictUnitKey = moveCompletionConflictByGoalDate.get(
        `${entry.originalGoalId}:${normalizedDate}`
      );
      const planned = planDraftMove({
        entry,
        nextDate: normalizedDate,
        scopeMonth,
        previewUnit: baselineUnit,
        conflictKeys: moveConflictByGoalDate.get(
          `${entry.originalGoalId}:${normalizedDate}`
        ),
        completionFactConflict: completionConflictUnitKey
          ? {
              unitKey: completionConflictUnitKey,
              scheduledDate: null,
            }
          : undefined,
      });
      if (!planned.ok) {
        toast.error(planned.message);
        return false;
      }
      if (!baselineUnit) {
        return false;
      }

      const existingMove = draftSaveCommands.find(
        (command) =>
          command.kind === "move_item" &&
          command.goalId === entry.originalGoalId &&
          command.unitKey === entry.unitKey
      );
      const sourceDate =
        existingMove?.kind === "move_item"
          ? existingMove.sourceDate
          : baselineUnit.scheduledDate ??
            entry.draftDiffFromDate ??
            planned.scheduledDate;
      const prospectiveState = draftCommandReducer(draftCommandState, {
        type: "upsert_move",
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        scheduledDate: planned.scheduledDate,
        sourceDate,
      });
      if (currentScopeMonth) {
        const prospectiveWindow = tryBuildPlannerDraftSaveWindow({
          currentMonth: currentScopeMonth,
          commands: selectDraftCommands(prospectiveState),
          workUnits: draftWindowWorkUnits,
        });
        if (!prospectiveWindow.ok) {
          toast.error(
            prospectiveWindow.code === "too_wide"
              ? PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
              : "That date cannot fit in the current draft window."
          );
          return false;
        }
      }

      dispatchDraftCommand({
        type: "upsert_move",
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        scheduledDate: planned.scheduledDate,
        sourceDate,
      });
      void source;
      return true;
    },
    [
      currentScopeMonth,
      draftCommandState,
      draftSaveCommands,
      draftWindowWorkUnits,
      scopeMonth,
      dispatchDraftCommand,
      moveConflictByGoalDate,
      moveCompletionConflictByGoalDate,
      draftWindowUnitByEntryKey,
    ]
  );
  useEffect(() => {
    queueDraftMoveCommandRef.current = queueDraftMoveCommand;
  }, [queueDraftMoveCommand]);

  const updateDraftLabel = (entry: PlannerDayDetailEntry, label: string) => {
    if (entry.draftGhost) {
      return;
    }
    if (!context?.scopeMonth) {
      return;
    }
    const baselineTitle =
      entry.activeGoal?.title ?? context?.goalTitles?.[entry.originalGoalId] ?? null;
    if (!label || label === baselineTitle) {
      dispatchDraftCommand({
        type: "remove_kind",
        kind: "rename_item",
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
      });
      return;
    }
    dispatchDraftCommand({
      type: "upsert_rename",
      goalId: entry.originalGoalId,
      unitKey: entry.unitKey,
      label,
    });
  };

  const updateDraftScheduledTimeOverride = (
    entry: PlannerDayDetailEntry,
    localTime: string
  ) => {
    if (!context?.scopeMonth) {
      return;
    }
    const baselineOverride =
      draftWindowUnitByEntryKey.get(entry.key)?.scheduledTimeOverride ??
      entry.activeItem?.scheduled_time_override ??
      null;
    const nextPlan = planDraftTimeOverrideUpdate({
      entry,
      localTimeInput: localTime,
      baselineOverride,
    });
    if (nextPlan.status === "blocked") {
      if (nextPlan.reason === "invalid_time") {
        toast.error("Time must be in 24-hour HH:MM format.");
      } else {
        toast.error(
          "Completed or historical sessions cannot change time overrides in preview mode. Clear completion in the saved plan first."
        );
      }
      return;
    }
    for (const action of nextPlan.actions) {
      dispatchDraftCommand(action);
    }
  };

  const updateDraftScheduledDate = (
    entry: PlannerDayDetailEntry,
    date: string
  ) => {
    if (entry.draftGhost) {
      return;
    }
    if (!date.trim()) {
      return;
    }
    void queueDraftMoveCommand({
      entry,
      nextDate: date,
      source: "date_input",
    });
  };

  const clearDragState = useCallback(() => {
    pointerPressActiveRef.current = false;
    setDraggingEntryKey(null);
  }, []);

  const getDragEntryLabel = useCallback(
    (entryKey: string) => {
      const entry = entryByKey.get(entryKey);
      return entry ? getEntryDisplayTitleWithTime(entry) : "planner session";
    },
    [entryByKey, getEntryDisplayTitleWithTime]
  );

  const getDragDayLabel = useCallback((day: string) => {
    if (!isValidIsoDate(day)) {
      return day;
    }
    return format(parse(day, "yyyy-MM-dd", new Date()), "EEEE, MMMM d");
  }, []);

  const renderEntryDragOverlay = useCallback(
    (entryKey: string) => {
      const entry = entryByKey.get(entryKey);
      if (!entry) {
        return null;
      }
      const visual = getGoalVisual({
        goalId: entry.originalGoalId,
        color: entry.activeGoal?.color ?? null,
      });
      const Icon = visual.Icon;
      const title = getEntryDisplayTitleWithTime(entry);
      const credited = isEntryCredited(entry);
      return (
        <div
          className={`flex max-w-64 items-center gap-2 rounded-lg border px-2 py-1 text-xs ${
            credited
              ? "border-emerald-300 bg-emerald-100 text-emerald-950"
              : "border-primary/40 bg-card text-foreground"
          }`}
        >
          <span
            className="inline-flex size-4 items-center justify-center rounded-full"
            style={{ backgroundColor: visual.color }}
          >
            <Icon className="size-2.5 text-white" />
          </span>
          <span className="truncate font-medium">{title}</span>
        </div>
      );
    },
    [entryByKey, getEntryDisplayTitleWithTime]
  );

  const handleDndEntryDragStart = useCallback(
    (entryKey: string) => {
      pointerPressActiveRef.current = true;
      clearHoverPreviewTimer();
      setDraggingEntryKey(entryKey);
    },
    [clearHoverPreviewTimer]
  );

  const reorderPreviewEntriesForDay = useCallback(
    (day: string, activeEntryKey: string, overEntryKey: string) => {
      const entriesForDay = getEntriesForDay(day);
      const incompleteKeys = entriesForDay
        .filter((entry) => !isEntryCredited(entry))
        .map((entry) => entry.key);
      const completedKeys = entriesForDay
        .filter((entry) => isEntryCredited(entry))
        .map((entry) => entry.key);
      setPreviewEntryOrderByDay((previous) => {
        const next = reorderPreviewEntryKeys({
          incompleteKeys,
          completedKeys,
          activeEntryKey,
          overEntryKey,
          existingOrder: previous[day],
        });
        if (!next) {
          return previous;
        }
        return {
          ...previous,
          [day]: next,
        };
      });
    },
    [getEntriesForDay]
  );

  const handleDndEntryDragEnd = useCallback(
    (entryKey: string, target: PlannerDragTarget) => {
      if (!target) {
        clearDragState();
        return;
      }
      const entry = entryByKey.get(entryKey);
      if (!entry) {
        clearDragState();
        return;
      }
      if (target.type === "preview_entry") {
        const sourceDay = entryDayByKey.get(entryKey) ?? null;
        if (sourceDay === target.day) {
          reorderPreviewEntriesForDay(target.day, entryKey, target.entryKey);
          clearDragState();
          return;
        }
        void queueDraftMoveCommand({
          entry,
          nextDate: target.day,
          source: "drag_drop",
        });
        clearDragState();
        return;
      }
      void queueDraftMoveCommand({
        entry,
        nextDate: target.day,
        source: "drag_drop",
      });
      clearDragState();
    },
    [
      clearDragState,
      entryByKey,
      entryDayByKey,
      queueDraftMoveCommand,
      reorderPreviewEntriesForDay,
    ]
  );

  const handleDndEntryDragCancel = useCallback(
    (entryKey: string | null) => {
      void entryKey;
      clearDragState();
    },
    [clearDragState]
  );
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
    if (entry.draftGhost) {
      return "unsupported";
    }
    if (!dispatch) {
      return "unsupported";
    }
    if (!dispatch.decision.allowed) {
      if (dispatch.decision.reason === "future_creation") {
        return "future_creation";
      }
      if (dispatch.decision.reason === "satisfied_elsewhere") {
        return "satisfied_elsewhere";
      }
      return "unsupported";
    }
    if (dispatch.decision.route === "canonical_exact_date") {
      return null;
    }
    if (dispatch.decision.route === "item_date") {
      if (!canMutatePlanItems || !entry.activeItem) {
        return "out_of_scope_route";
      }
      return null;
    }
    if (dispatch.decision.route === "plan_goal_date") {
      if (!canMutatePlanItems || !entry.activeGoal) {
        return "out_of_scope_route";
      }
      return null;
    }
    return "out_of_scope_route";
  };

  const toggleItemLock = async (entry: PlannerDayDetailEntry) => {
    if (!context || !entry.activeItem) {
      return;
    }
    const expectedDigest = context.revisions.scheduleDigest;
    if (!expectedDigest) {
      toast.error("Planner state is stale. Refresh and try again.");
      return;
    }

    const nextLocked = !entry.activeItem.locked;
    const mutationKey = `lock:${entry.activeItem.id}`;
    setMutationLoadingKey(mutationKey);
    let lockUpdated = false;
    try {
      try {
        await postJson("/api/planner/items/lock", {
          itemId: entry.activeItem.id,
          locked: nextLocked,
          expectedDigest,
        });
        lockUpdated = true;
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Planner lock update failed."));
        return;
      }
      try {
        handlePlannerMutation();
        const refreshed = await withPlannerRefreshTimeout({
          operation: loadContext({
            showLoading: false,
            toastOnError: false,
            forcePrepare: true,
          }),
          timeoutMessage:
            "Lock updated, but calendar refresh timed out. Please refresh the page.",
        });
        if (!refreshed) {
          toast.error(
            "Lock updated, but calendar refresh failed. Please refresh the page."
          );
          return;
        }
      } catch (error) {
        if (lockUpdated) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Lock updated, but calendar refresh failed. Please refresh the page."
          );
          return;
        }
        toast.error(
          getApiErrorMessage(error, "Planner lock update failed.")
        );
      }
    } finally {
      setMutationLoadingKey(null);
    }
  };

  const toggleDateFact = async (
    entry: PlannerDayDetailEntry,
    selectedDateOverride?: string,
    sourceElement?: HTMLElement
  ) => {
    const sourceRect = sourceElement
      ? captureViewportRect(sourceElement)
      : undefined;
    const selectedDate = selectedDateOverride ?? effectiveSelectedDay;
    if (!context || !selectedDate) {
      return;
    }
    const dispatch = getDateFactDispatchForEntry(entry, selectedDate);
    const disabledReason = completionControlDisabledReasonForEntry(
      entry,
      dispatch
    );
    if (disabledReason) {
      toast.error(completionDisabledReasonCopy(disabledReason));
      return;
    }
    if (!dispatch) {
      toast.error("This planner item cannot be updated from the current snapshot.");
      return;
    }
    const desiredFactState = dispatch.desiredFactState;
    if (!dispatch.decision.allowed) {
      const message =
        dispatch.decision.reason === "future_creation"
          ? "You can only mark completions for today or a past date."
          : dispatch.decision.reason === "satisfied_elsewhere"
            ? "This completion is already satisfied by another session."
            : "This completion cannot be changed from here.";
      toast.error(message);
      return;
    }
    const requiresPlannerExpectation =
      dispatch.decision.route === "item_date" ||
      dispatch.decision.route === "plan_goal_date";
    const expectedDigest = context.revisions.scheduleDigest;
    if (requiresPlannerExpectation && !expectedDigest) {
      toast.error("Planner state is stale. Refresh and try again.");
      return;
    }
    const mutationKey = `fact:${entry.key}`;
    const draftDateOverlayActive = Boolean(
      hasDraftSession &&
        !entry.draftGhost &&
        (entry.draftDiffKind === "moved_to" ||
          entry.draftDiffKind === "new" ||
          effectiveDraftItemEdits[entry.key]?.scheduledDate !== undefined)
    );

    setMutationLoadingKey(mutationKey);
    try {
      const result = await runCompletionMutation({
        decision: dispatch.decision,
        desiredFactState,
        goalId: entry.originalGoalId,
        date: selectedDate,
        timezone: context.timezone,
        sourceRect,
        plannerItemExpectation:
          requiresPlannerExpectation && entry.activeItem && expectedDigest
          ? {
              itemId: entry.activeItem.id,
              expectedDigest,
            }
          : undefined,
        plannerGoalExpectation:
          requiresPlannerExpectation && entry.activeGoal && expectedDigest
          ? {
              expectedDigest,
            }
          : undefined,
        fallbackErrorMessage: "Planner completion update failed.",
      });

      if (!result.ok) {
        toast.error(result.message ?? "Planner completion update failed.");
        return;
      }

      let draftPreviewRefreshFailed = false;
      if (hasDraftSession && draftSaveCommands.length === 0) {
        const draftPolicyForRefresh =
          effectiveDraftPolicy ?? context.preferences?.defaultPolicy ?? null;
        if (draftPolicyForRefresh) {
          try {
            await refreshDraftPreview(draftPolicyForRefresh);
          } catch {
            draftPreviewRefreshFailed = true;
            toast(
              "Completion saved, but your preview overlay could not refresh automatically. Regenerate preview to sync."
            );
          }
        }
      }

      handlePlannerMutation();
      const refreshed = await withPlannerRefreshTimeout({
        operation: loadContext({
          showLoading: false,
          toastOnError: false,
        }),
        timeoutMessage:
          "Completion updated, but calendar refresh timed out. Please refresh the page.",
      });
      if (!refreshed) {
        toast.error(
          "Completion updated, but calendar refresh failed. Please refresh the page."
        );
        return;
      }
      if (draftDateOverlayActive || draftPreviewRefreshFailed) {
        toast(
          "This entry is still shown with preview overlays. Save or discard preview edits to view canonical placement only."
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Planner completion update failed."
      );
    } finally {
      setMutationLoadingKey(null);
    }
  };

  const savePlan = async () => {
    if (!context) {
      return;
    }
    if (!draftSaveWindow) {
      toast.error(plannerDraftWindowUnavailableMessage(draftSaveWindowResult));
      return;
    }
    const expectedDigest = context.revisions.scheduleDigest;
    if (!expectedDigest) {
      toast.error("Planner state is stale. Refresh and regenerate the preview.");
      return;
    }

    setSaveLoading(true);
    let payload: PlannerErrorPayload & {
      replayed?: boolean;
    };
    try {
      const refreshPolicy =
        effectiveDraftPolicy ?? context.preferences?.defaultPolicy ?? null;
      const useDirectDraftPersistence = shouldUseDirectDraftPersistence({
        draftCommands: draftSaveCommands,
        requestedPolicy: effectiveDraftPolicy,
      });
      if (useDirectDraftPersistence) {
        try {
          payload = await postJson<
            PlannerErrorPayload & {
              replayed?: boolean;
            }
          >("/api/planner/save", {
            expectedDigest,
            startDate: draftSaveWindow.start,
            endDate: draftSaveWindow.end,
            previewHash:
              context.preview?.generationInputHash ??
              "0".repeat(64),
            eligibilityMode: context.preview?.eligibilityMode,
            confirmationHash: null,
            policy: effectiveDraftPolicy ?? undefined,
            draftCommands: draftSaveCommands,
          });
        } catch (error) {
          toast.error(getApiErrorMessage(error, "Planner save failed."));
          return;
        }
      } else {
      const monthWindow = getScopeDateRange(context.scopeMonth);
      const previewMatchesWriteWindow = (
        preview: NonNullable<PlannerContextPayload["preview"]> | null
      ) => {
        if (!preview) {
          return false;
        }
        if (preview === draftPreview) {
          return (
            draftPreviewWindow?.start === draftSaveWindow.start &&
            draftPreviewWindow?.end === draftSaveWindow.end
          );
        }
        if (
          preview === context.preview &&
          draftSaveCommands.length === 0 &&
          !effectiveDraftPolicy
        ) {
          return (
            draftSaveWindow.start === monthWindow.start &&
            draftSaveWindow.end === monthWindow.end
          );
        }
        return false;
      };
      let savePreview =
        draftPreview ??
        (draftSaveCommands.length === 0 && !effectiveDraftPolicy
          ? context.preview
          : null);
      if (!previewMatchesWriteWindow(savePreview)) {
        savePreview = null;
      }
      if (!savePreview) {
        if (!refreshPolicy) {
          toast.error(
            "Preview is unavailable. Regenerate before saving."
          );
          return;
        }
        savePreview = await requestPreviewForWindow({
          startDate: draftSaveWindow.start,
          endDate: draftSaveWindow.end,
          nextPolicy: refreshPolicy,
          solveIntent: "stable",
          draftCommands: draftSaveCommands,
        });
        if (savePreview) {
          setDraftPreview(savePreview);
          setDraftPreviewWindow({
            start: draftSaveWindow.start,
            end: draftSaveWindow.end,
          });
        }
      }
      if (!savePreview) {
        toast.error("Preview is unavailable. Regenerate before saving.");
        return;
      }
      const publishBlockedByElapsedWindow =
        getWindowState(draftSaveWindow, context.asOfDate) === "historical";
      if (publishBlockedByElapsedWindow || !savePreview.solver.publishable) {
        toast.error(nonPublishablePreviewMessage(savePreview));
        return;
      }
      const saveRequestBody = buildPlannerSaveRequestBody({
        expectedDigest,
        saveWindow: draftSaveWindow,
        preview: savePreview,
        policy: effectiveDraftPolicy,
        draftCommands: draftSaveCommands,
      });
      try {
        payload = await postJson<
          PlannerErrorPayload & {
            replayed?: boolean;
          }
        >("/api/planner/save", saveRequestBody);
      } catch (error) {
        if (isApiClientError(error) && error.code === "planner_not_publishable") {
          const issueCodes = Array.isArray(error.details?.issueCodes)
            ? error.details.issueCodes.filter(
                (value): value is string => typeof value === "string"
              )
            : [];
          const detailSuffix =
            issueCodes.length > 0 ? ` (${issueCodes.join(", ")})` : "";
          toast.error(
            `${error.message ?? "Planner save is currently blocked."}${detailSuffix}`
          );
          return;
        }
        toast.error(getApiErrorMessage(error, "Planner save failed."));
        return;
      }
      }
      try {
        handlePlannerMutation();
        const refreshed = await withPlannerRefreshTimeout({
          operation: loadContext({
            showLoading: false,
            toastOnError: false,
          }),
          timeoutMessage:
            "Plan saved, but calendar refresh timed out. Please refresh the page.",
        });
        if (!refreshed) {
          toast.error(
            "Plan saved, but calendar refresh failed. Please refresh the page."
          );
          return;
        }
        clearDraftSession();
        coach.actions.resetForPlannerStateReset();
        toast.success(payload.replayed ? "Save replayed." : "Plan saved.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Plan saved, but calendar refresh failed. Please refresh the page."
        );
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const resetPlan = async () => {
    if (!context?.scopeMonth) {
      return;
    }
    const expectedDigest = context.revisions.scheduleDigest;
    if (!expectedDigest) {
      toast.error("Planner state is stale. Refresh and try again.");
      return;
    }
    setResetLoading(true);
    try {
      try {
        await postJson("/api/planner/reset", {
          scopeMonth: context.scopeMonth,
          expectedDigest,
        });
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Planner month could not be reset."));
        return;
      }
      try {
        clearDraftSession();
        handlePlannerMutation();
        const refreshed = await withPlannerRefreshTimeout({
          operation: loadContext({
            showLoading: false,
            toastOnError: false,
          }),
          timeoutMessage:
            "Plan reset, but calendar refresh timed out. Please refresh the page.",
        });
        if (!refreshed) {
          toast.error(
            "Plan reset, but calendar refresh failed. Please refresh the page."
          );
          return;
        }
        coach.actions.resetForPlannerStateReset();
        toast.success("Plan reset.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Plan reset, but calendar refresh failed. Please refresh the page."
        );
      }
    } finally {
      setResetLoading(false);
    }
  };

  const resetPlanFully = async () => {
    if (!context) {
      return;
    }
    const expectedDigest = context.revisions.scheduleDigest;
    if (!expectedDigest) {
      toast.error("Planner state is stale. Refresh and try again.");
      return;
    }
    const confirmed = window.confirm(
      "Full reset will replace planner schedules across the planning horizon with a fresh default plan. Continue?"
    );
    if (!confirmed) {
      return;
    }

    setFullResetLoading(true);
    const asOfMonth = context.asOfDate.slice(0, 7);
    const scopeMonthsToProcess = new Set<string>([
      context.scopeMonth,
      ...(month ? [month] : []),
    ]);
    for (let monthOffset = 0; monthOffset < 24; monthOffset += 1) {
      scopeMonthsToProcess.add(
        format(addMonths(parseMonth(asOfMonth), monthOffset), "yyyy-MM")
      );
    }

    const scopeMonths = Array.from(scopeMonthsToProcess).sort((left, right) =>
      left.localeCompare(right)
    );

    try {
      const payload = await postJson<{
        scopeCount: number;
      }>("/api/planner/reset-all", {
        expectedDigest,
        scopeMonths,
      });

      clearDraftSession();
      handlePlannerMutation();
      const refreshed = await withPlannerRefreshTimeout({
        operation: loadContext({
          showLoading: false,
          toastOnError: false,
          forcePrepare: true,
        }),
        timeoutMessage:
          "Full reset ran, but calendar refresh timed out. Please refresh the page.",
      });
      if (!refreshed) {
        toast.error(
          "Full reset ran, but calendar refresh failed. Please refresh the page."
        );
        return;
      }
      coach.actions.resetForPlannerStateReset();
      const appliedScopeCount =
        typeof payload.scopeCount === "number" && payload.scopeCount > 0
          ? payload.scopeCount
          : scopeMonths.length;
      toast.success(
        `Full reset complete for ${appliedScopeCount} month${
          appliedScopeCount === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Full planner reset failed."));
    } finally {
      setFullResetLoading(false);
    }
  };

  const rebuildSchedule = async () => {
    if (rebuildLoading) {
      return;
    }
    if (hasDraftSession) {
      toast.error("Save or undo preview changes before rebuilding schedule.");
      return;
    }
    setRebuildLoading(true);
    try {
      handlePlannerMutation();
      const refreshed = await withPlannerRefreshTimeout({
        operation: loadContext({
          showLoading: false,
          toastOnError: false,
          forcePrepare: true,
        }),
        timeoutMessage:
          "Schedule rebuild ran, but calendar refresh timed out. Please refresh the page.",
      });
      if (!refreshed) {
        toast.error(
          "Schedule rebuild ran, but calendar refresh failed. Please refresh the page."
        );
        return;
      }
      toast.success("Schedule rebuilt.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Schedule rebuild failed."));
    } finally {
      setRebuildLoading(false);
    }
  };

  const discardDraftChanges = () => {
    if (!hasDraftSession) {
      return;
    }
    clearDraftSession();
    coach.actions.onDraftDiscarded();
    toast.success("Preview changes reverted to the saved baseline.");
  };

  const showBlockingLoading = loading && context === null;
  const monthLabel = month ? monthToLabel(month) : "Calendar";
  const todayMonth = context?.timezone
    ? getMonthInTimezone(context.timezone)
    : getMonthInTimezone(setupTimezone);
  const parsedFocusedDay = parse(focusedDay, "yyyy-MM-dd", new Date());
  const safeFocusedDay = isValid(parsedFocusedDay)
    ? parsedFocusedDay
    : parse(calendarToday, "yyyy-MM-dd", new Date());
  const focusedWeekStartDate = parse(
    focusedWeekDays[0] ?? focusedDay,
    "yyyy-MM-dd",
    new Date()
  );
  const focusedWeekEndDate = parse(
    focusedWeekDays[6] ?? focusedDay,
    "yyyy-MM-dd",
    new Date()
  );
  const focusedThreeDayStartDate = parse(
    focusedThreeDayDays[0] ?? focusedDay,
    "yyyy-MM-dd",
    new Date()
  );
  const focusedThreeDayEndDate = parse(
    focusedThreeDayDays[2] ?? focusedDay,
    "yyyy-MM-dd",
    new Date()
  );
  const viewHeading =
    viewMode === "month"
      ? monthLabel
      : viewMode === "week"
        ? `${format(focusedWeekStartDate, "MMM d")} - ${format(
            focusedWeekEndDate,
            "MMM d, yyyy"
          )}`
        : viewMode === "three_day"
          ? `${format(focusedThreeDayStartDate, "MMM d")} - ${format(
              focusedThreeDayEndDate,
              "MMM d, yyyy"
            )}`
        : format(safeFocusedDay, "EEE MMM d, yyyy");
  const fixedViewHeadingWidthCh = Math.max(
    monthLabel.length,
    MAX_MONTH_HEADING_SAMPLE.length,
    MAX_WEEK_HEADING_SAMPLE.length,
    MAX_THREE_DAY_HEADING_SAMPLE.length,
    MAX_DAY_HEADING_SAMPLE.length
  );
  const viewDescription =
    viewMode === "month"
      ? `${restWeekdayOptions.find((option) => option.value === weekStartsOn)?.label ?? "Mon"}-first month view. Drag session pills to stage preview edits.`
      : viewMode === "week"
        ? "Expanded 7-day planner view with drag-and-drop editing."
        : viewMode === "three_day"
          ? "Three-day focus with a scrollable week strip for context."
        : "Day agenda with a scrollable week strip and detail controls.";
  const previousWindowAriaLabel =
    viewMode === "month"
      ? "Previous month"
      : viewMode === "week"
        ? "Previous week"
        : viewMode === "three_day"
          ? "Previous 3 days"
        : "Previous day";
  const nextWindowAriaLabel =
    viewMode === "month"
      ? "Next month"
      : viewMode === "week"
        ? "Next week"
        : viewMode === "three_day"
          ? "Next 3 days"
        : "Next day";
  const canResetViewWindow =
    viewMode === "month" ? month !== todayMonth : focusedDay !== calendarToday;
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
    const stepDays = viewMode === "week" ? 7 : viewMode === "three_day" ? 3 : 1;
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
  const blockedSave = draftWindowTooWide
    ? PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
    : context &&
        effectivePreview &&
        (getWindowState(draftSaveWindow ?? { start: context.asOfDate, end: context.asOfDate }, context.asOfDate) ===
          "historical" ||
          !effectivePreview.solver.publishable)
      ? nonPublishablePreviewMessage(effectivePreview)
      : null;
  const draftSaveBlocked = blockedSave !== null;
  const draftSaveBlockedMessage = blockedSave;
  const rebuildBlockedMessage = hasDraftSession
    ? "Save or undo preview changes before rebuilding schedule."
    : undefined;
  const hasLockedPlanItems = Boolean(
    context?.activePlan?.items.some((item) => item.locked)
  );
  const canResetPlan = Boolean(
    !hasDraftSession && hasLockedPlanItems
  );
  const hasUnsavedPlannerChanges = Boolean(
    hasDraftSession || !context?.activePlan
  );
  const canShowSaveAction = Boolean(effectivePreview);
  const saveButtonLabel = saveLoading ? "Saving..." : "Save plan";
  const readOnlyMonthHint =
    "This session belongs to another month snapshot. Open that month to edit it.";
  const selectedEventCompletionDispatch = selectedEventEntry
    ? getDateFactDispatchForEntry(selectedEventEntry)
    : null;
  const selectedEventCompletionDisabledReason = selectedEventEntry
    ? completionControlDisabledReasonForEntry(
        selectedEventEntry,
        selectedEventCompletionDispatch
      )
    : null;
  const renderCalendarDayCell = (cell: { date: string; inMonth: boolean }) => {
    const entriesForDay = getOrderedEntriesForDay(cell.date);
    const completionFactMarkersForDay = getCompletionFactMarkersForDay(cell.date);
    const status =
      entriesForDay.length > 0
        ? getDayStatus(entriesForDay, "No items")
        : completionFactMarkersForDay.length > 0
          ? "Completed elsewhere"
          : "No items";
    const isToday = cell.date === calendarToday;
    const isPastInMonth = cell.inMonth && cell.date < calendarToday;
    const ariaLabel = `${format(
      parse(cell.date, "yyyy-MM-dd", new Date()),
      "EEEE, MMMM d, yyyy"
    )}. ${entriesForDay.length} planned item${
      entriesForDay.length === 1 ? "" : "s"
    }. ${completionFactMarkersForDay.length} completion fact${
      completionFactMarkersForDay.length === 1 ? "" : "s"
    }. ${status}.`;

    return (
      <CalendarMonthDayCell
        key={`${viewMode}-${cell.date}`}
        day={cell.date}
        inMonth={cell.inMonth}
        isToday={isToday}
        isPastInMonth={isPastInMonth}
        ariaLabel={ariaLabel}
        entriesForDay={entriesForDay}
        completionFactMarkersForDay={completionFactMarkersForDay}
        maxVisibleItems={
          viewMode === "week" || viewMode === "three_day"
            ? Number.MAX_SAFE_INTEGER
            : expandedMonthRows
              ? Number.MAX_SAFE_INTEGER
              : 2
        }
        isAnyEntryDragging={Boolean(draggingEntryKey)}
        getEntryDisplayTitle={getEntryDisplayTitleWithTime}
        isEntryCredited={isEntryCredited}
        isEntryImmovableForDraft={(entry) =>
          plannerReadOnly ||
          !canMutateEntryOnDay(entry, cell.date) ||
          isEntryImmovableForDraft(entry)
        }
        onEntryClick={(day, entry, target) => {
          if (!canMutateEntryOnDay(entry, day)) {
            return;
          }
          if (viewMode === "day") {
            if (day !== focusedDay) {
              setLocalSelectedDay(day);
              onSelectedDayChange(day, "push", "day");
            }
            setSelectedEventEntryKey(entry.key);
            setDayPreview(null);
            return;
          }
          clearHoverPreviewTimer();
          clearHoverPreviewCloseTimer();
          setSelectedEventEntryKey(null);
          openDayPreview({ day, pinned: true, target });
        }}
        onCellClick={(target) => {
          if (draggingEntryKey) {
            return;
          }
          if (viewMode === "day") {
            if (cell.date !== focusedDay) {
              setLocalSelectedDay(cell.date);
              onSelectedDayChange(cell.date, "push", "day");
            }
            setDayPreview(null);
            return;
          }
          handleDayCellClick(cell.date, target);
        }}
        onCellMouseEnter={(target) => {
          if (viewMode === "day") {
            return;
          }
          scheduleHoverPreview(cell.date, target);
        }}
        onCellMouseLeave={() => {
          if (viewMode === "day") {
            return;
          }
          clearHoverPreviewTimer();
          scheduleHoverPreviewClose(cell.date);
        }}
        onCellPointerDown={(pointerType, target) => {
          if (viewMode === "day") {
            return;
          }
          pointerPressActiveRef.current = true;
          clearHoverPreviewTimer();
          if (pointerType === "touch") {
            startLongPressPreview(cell.date, target);
          }
        }}
        onCellPointerUp={() => {
          if (viewMode === "day") {
            return;
          }
          pointerPressActiveRef.current = false;
          clearLongPressTimer();
        }}
        onCellPointerCancel={() => {
          if (viewMode === "day") {
            return;
          }
          pointerPressActiveRef.current = false;
          clearLongPressTimer();
        }}
        onCellPointerLeave={() => {
          if (viewMode === "day") {
            return;
          }
          clearLongPressTimer();
        }}
        onEntryPointerStart={(immovable) => {
          void immovable;
          pointerPressActiveRef.current = true;
          clearHoverPreviewTimer();
          setDayPreview(null);
        }}
        onEntryPointerEnd={() => {
          pointerPressActiveRef.current = false;
        }}
      />
    );
  };
  const rollingWeekStrip = (
    <div className="mx-auto w-full max-w-[56rem]">
      <div ref={rollingWeekStripRef} className="overflow-x-auto pb-1">
        <div
          className={`${ROLLING_WEEK_GRID_LABELS_BASE_CLASS} ${
            ROLLING_WEEK_GRID_WIDTH_BY_VIEW[viewMode === "day" ? "day" : "three_day"]
          }`}
        >
          {focusedWeekDays.map((day) => (
            <span key={`rolling-week-label-${day}`}>
              {format(parse(day, "yyyy-MM-dd", new Date()), "EEE d")}
            </span>
          ))}
        </div>
        <div
          data-rolling-week-grid="cells"
          className={`${ROLLING_WEEK_GRID_CELLS_BASE_CLASS} ${
            ROLLING_WEEK_GRID_WIDTH_BY_VIEW[viewMode === "day" ? "day" : "three_day"]
          }`}
        >
          {focusedWeekCells.map(renderCalendarDayCell)}
        </div>
      </div>
    </div>
  );

  const restWeekdaysField = (
    <div className="space-y-2 text-sm">
      <p>Rest weekdays</p>
      <div className="flex flex-wrap gap-2">
        {restWeekdayOptions.map((option) => (
          <label
            key={option.label}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
          >
            <input
              type="checkbox"
              checked={setupRestWeekdays.includes(option.value)}
              onChange={(event) =>
                setSetupRestWeekdays((previous) =>
                  event.target.checked
                    ? Array.from(new Set([...previous, option.value])).sort(
                        (left, right) => left - right
                      )
                    : previous.filter((weekday) => weekday !== option.value)
                )
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );

  const plannerSettingsForm = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Timezone and first-day-of-week preferences now live in Profile settings.
      </p>
      {restWeekdaysField}
      <Button type="button" onClick={submitSetup} disabled={setupLoading}>
        {setupLoading ? "Saving settings..." : "Save settings"}
      </Button>
      <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs text-muted-foreground">
          Full reset clears planner schedule snapshots across the active 24-month horizon.
        </p>
        <Button
          type="button"
          variant="destructive"
          onClick={() => void resetPlanFully()}
          disabled={fullResetLoading || loading || resetLoading}
        >
          {fullResetLoading ? "Running full reset..." : "Full reset planner"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                <h2 className="text-lg font-semibold">Calendar</h2>
                {hasDraftSession ? (
                  <Badge
                    data-testid="planner-preview-mode-badge"
                    className="h-7 border-amber-300 bg-amber-100 px-3 text-sm font-semibold text-amber-950 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-950"
                  >
                    Planning Mode
                  </Badge>
                ) : null}
              </div>
              {horizonCounter ? (
                <p className="text-xs text-muted-foreground">
                  {horizonCounter.thisWindow} planned / {horizonCounter.total} total{" "}
                  {horizonCounter.remaining > 0
                    ? `· ${horizonCounter.remaining} remaining`
                    : "· all credited"}
                </p>
              ) : null}
              {eligibilityNotices.hardIneligible.length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-950">
                  {eligibilityNotices.hardIneligible
                    .slice(0, 4)
                    .map((item) => `${item.goalTitle}: ${item.reasonCopy}`)
                    .join(" · ")}
                  {eligibilityNotices.hardIneligible.length > 4
                    ? ` · +${eligibilityNotices.hardIneligible.length - 4} more`
                    : ""}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {plannerReadOnly ? (
                <span className="text-xs text-muted-foreground">
                  Partner completions (read-only)
                </span>
              ) : canResetPlan ? (
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
                  variant="outline"
                  onClick={rebuildSchedule}
                  title={rebuildBlockedMessage}
                  disabled={rebuildLoading || loading || hasDraftSession}
                >
                  {rebuildLoading ? "Rebuilding..." : "Rebuild schedule"}
                </Button>
              ) : null}
              {!plannerReadOnly && canShowSaveAction ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={savePlan}
                  title={draftSaveBlockedMessage ?? undefined}
                  disabled={
                    saveLoading ||
                    loading ||
                    !context ||
                    !draftSaveWindow ||
                    !hasUnsavedPlannerChanges ||
                    draftSaveBlocked
                  }
                >
                  {saveButtonLabel}
                </Button>
              ) : null}
              {hasDraftSession ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={discardDraftChanges}
                  disabled={saveLoading || loading}
                >
                  Undo changes
                </Button>
              ) : null}
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
              <Select
                value={viewMode}
                onValueChange={(value) =>
                  setCalendarViewMode(
                    value as (typeof PLANNER_VIEW_MODES)[number]["value"]
                  )
                }
              >
                <SelectTrigger
                  className="h-8 w-[7.5rem] rounded-md bg-background/90 text-xs"
                  disabled={loading}
                  aria-label="Calendar view mode"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANNER_VIEW_MODES.map((modeOption) => (
                    <SelectItem key={modeOption.value} value={modeOption.value}>
                      {modeOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {partnerOverlayError ? (
        <p className="text-xs text-muted-foreground">{partnerOverlayError}</p>
      ) : null}
      {unplaceableGoalSummaries.length > 0 && !showBlockingLoading && !error ? (
        <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              {invalidLockGoalCount > 0
                ? `\u26A0 ${unplaceableGoalSummaries.length} goal${
                    unplaceableGoalSummaries.length === 1 ? "" : "s"
                  } need attention (${invalidLockGoalCount} locked conflict${
                    invalidLockGoalCount === 1 ? "" : "s"
                  }, ${totalUnplacedCount} unresolved session${
                    totalUnplacedCount === 1 ? "" : "s"
                  }).`
                : `\u26A0 ${unplaceableGoalSummaries.length} goal${
                    unplaceableGoalSummaries.length === 1 ? "" : "s"
                  } are not fully scheduled (${totalUnplacedCount} unresolved session${
                    totalUnplacedCount === 1 ? "" : "s"
                  }).`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {primaryUnplaceableGoal ? (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                  <Link href={`/goals/${primaryUnplaceableGoal.goalId}`}>
                    {unplaceablePrimaryActionLabel}
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSettingsOpen(true)}
              >
                Change rest days for all goals
              </Button>
            </div>
          </div>
        </div>
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
            <div className="mx-auto mb-3 w-full max-w-[56rem] space-y-3">
              <div className="flex w-full justify-center">
                <PeriodStepper
                  className="shrink-0"
                  onPrevious={() => moveViewWindow(-1)}
                  onNext={() => moveViewWindow(1)}
                  previousDisabled={loading}
                  nextDisabled={loading}
                  previousAriaLabel={previousWindowAriaLabel}
                  nextAriaLabel={nextWindowAriaLabel}
                  center={
                    <h3
                      className="truncate text-center text-base font-semibold"
                      style={{ width: `${fixedViewHeadingWidthCh}ch` }}
                    >
                      {viewHeading}
                    </h3>
                  }
                />
              </div>
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
                      <CalendarDayPreviewList
                        day={focusedDay}
                        entries={focusedDayEntries}
                        completionFactMarkers={focusedDayCompletionFactMarkers}
                        mutationLoading={Boolean(mutationLoadingKey)}
                        getEntryDisplayTitle={getEntryDisplayTitleWithTime}
                        getEntrySubtitle={getEntrySubtitle}
                        isEntryCredited={isEntryCredited}
                        isEntryImmovableForDraft={(entry) =>
                          !canMutateEntryOnDay(entry, focusedDay) ||
                          isEntryImmovableForDraft(entry)
                        }
                        getCompletionToggleState={(entry, day) => {
                          if (!canMutateEntryOnDay(entry, day)) {
                            return {
                              currentlyCredited: isEntryCredited(entry),
                              disabledReasonCopy: readOnlyMonthHint,
                            };
                          }
                          const dayCompletionDispatch = getDateFactDispatchForEntry(entry, day);
                          const dayCompletionDisabledReason =
                            completionControlDisabledReasonForEntry(
                              entry,
                              dayCompletionDispatch
                            );
                          return {
                            currentlyCredited: Boolean(
                              dayCompletionDispatch?.currentlyCredited
                            ),
                            disabledReasonCopy: dayCompletionDisabledReason
                              ? completionDisabledReasonCopy(dayCompletionDisabledReason)
                              : null,
                          };
                        }}
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
                  <AnchoredPopupCard
                    popupRef={dayPreviewRef}
                    position={dayPreview.position}
                    onPointerDownCapture={() => {
                      setDayPreview((current) =>
                        current && !current.pinned
                          ? { ...current, pinned: true }
                          : current
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
                    title={format(
                      parse(dayPreview.day, "yyyy-MM-dd", new Date()),
                      "EEEE, MMM d"
                    )}
                    actions={
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          disabled={previewDayEntries.length === 0}
                          onClick={() => {
                            const firstEntry = previewDayEntries[0];
                            if (!firstEntry) {
                              return;
                            }
                            setLocalSelectedDay(dayPreview.day);
                            setSelectedEventEntryKey(firstEntry.key);
                          }}
                        >
                          <Maximize2 className="mr-1 size-3" />
                          Expand
                        </Button>
                        {dayPreview.pinned ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setDayPreview(null)}
                          >
                            X
                          </Button>
                        ) : null}
                      </>
                    }
                  >
                    <CalendarDayPreviewList
                      day={dayPreview.day}
                      entries={previewDayEntries}
                      completionFactMarkers={previewDayCompletionFactMarkers}
                      mutationLoading={Boolean(mutationLoadingKey)}
                      getEntryDisplayTitle={getEntryDisplayTitleWithTime}
                      getEntrySubtitle={getEntrySubtitle}
                      isEntryCredited={isEntryCredited}
                      isEntryImmovableForDraft={(entry) =>
                        !canMutateEntryOnDay(entry, dayPreview.day) ||
                        isEntryImmovableForDraft(entry)
                      }
                      getCompletionToggleState={(entry, day) => {
                        if (!canMutateEntryOnDay(entry, day)) {
                          return {
                            currentlyCredited: isEntryCredited(entry),
                            disabledReasonCopy: readOnlyMonthHint,
                          };
                        }
                        const previewCompletionDispatch = getDateFactDispatchForEntry(
                          entry,
                          day
                        );
                        const previewCompletionDisabledReason =
                          completionControlDisabledReasonForEntry(
                            entry,
                            previewCompletionDispatch
                          );
                        return {
                          currentlyCredited: Boolean(
                            previewCompletionDispatch?.currentlyCredited
                          ),
                          disabledReasonCopy: previewCompletionDisabledReason
                            ? completionDisabledReasonCopy(previewCompletionDisabledReason)
                            : null,
                        };
                      }}
                      onEntryOpen={(entryKey) => {
                        const entry = previewDayEntries.find(
                          (candidate) => candidate.key === entryKey
                        );
                        if (!entry || !canMutateEntryOnDay(entry, dayPreview.day)) {
                          return;
                        }
                        setLocalSelectedDay(dayPreview.day);
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
                      density="compact"
                    />
                  </AnchoredPopupCard>
                ) : null}
              </div>
            </PlannerDndProvider>
          </div>

          <PlannerCoachPanel coach={coach} />

          <Dialog
            open={Boolean(selectedEventEntry)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedEventEntryKey(null);
                setLocalSelectedDay(null);
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
                            effectiveSelectedDay ??
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
                            disabled={
                              Boolean(mutationLoadingKey) ||
                              !canMutatePlanItems
                            }
                          >
                            {mutationLoadingKey ===
                            `lock:${selectedEventEntry.activeItem.id}`
                              ? "Saving..."
                              : selectedEventEntry.activeItem.locked
                                ? "Unlock"
                                : "Lock"}
                          </Button>
                          <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1">
                            <CompletionToggle
                              completed={Boolean(
                                selectedEventCompletionDispatch?.currentlyCredited
                              )}
                              pending={
                                mutationLoadingKey === `fact:${selectedEventEntry.key}`
                              }
                              size="sm"
                              onClick={(event) =>
                                void toggleDateFact(
                                  selectedEventEntry,
                                  undefined,
                                  event.currentTarget
                                )
                              }
                              disabled={
                                Boolean(mutationLoadingKey) ||
                                selectedEventCompletionDisabledReason !== null
                              }
                              aria-label={
                                selectedEventCompletionDispatch?.currentlyCredited
                                  ? "Mark session not done"
                                  : "Mark session done"
                              }
                              title={
                                selectedEventCompletionDisabledReason
                                  ? completionDisabledReasonCopy(
                                      selectedEventCompletionDisabledReason
                                    )
                                  : "Toggle completion for this session"
                              }
                            />
                            <span className="text-xs font-medium">
                              {mutationLoadingKey === `fact:${selectedEventEntry.key}`
                                ? "Saving..."
                                : selectedEventCompletionDispatch?.currentlyCredited
                                  ? "Undo done"
                                  : "Mark done"}
                            </span>
                          </div>
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
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planner settings</DialogTitle>
            <DialogDescription>
              Update rest weekdays used by planner default policy.
            </DialogDescription>
          </DialogHeader>
          {plannerSettingsForm}
        </DialogContent>
      </Dialog>
    </div>
  );
}
