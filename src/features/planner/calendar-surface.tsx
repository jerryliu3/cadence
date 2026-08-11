"use client";

import { addDays, addMonths, format, isValid, parse } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
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
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  getEntryDraftPillClasses,
  getDayStatus,
  getEntryDisplayTitle,
  getEntrySubtitle,
  getMonthInTimezone,
  isEntryCredited,
  isEntryImmovableForDraft,
  monthToLabel,
  moveItemInArray,
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
  selectDraftCommandsForScope,
} from "@/features/planner/draft-command-reducer";
import { planDraftTimeOverrideUpdate } from "@/features/planner/draft-time-override";
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
import {
  type CompletionDispatchDecision,
  resolveCompletionDispatch,
} from "@/lib/planner/completion-dispatch";
import {
  draftCommandEntryKey,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import { buildPlannerConfirmationHash } from "@/lib/planner/publish-payload";
import {
  createDefaultPlannerPolicy,
  type PlannerPolicy,
} from "@/lib/planner/policy";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";
import { captureViewportRect } from "@/lib/xp/events";
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
import { usePlannerVisibleMonthContexts } from "@/features/planner/use-planner-visible-month-contexts";
const DAY_PREVIEW_HOVER_DELAY_MS = 500;
const DAY_PREVIEW_CLOSE_DELAY_MS = 180;
const DAY_PREVIEW_LONG_PRESS_DELAY_MS = 500;
const MAX_MONTH_HEADING_SAMPLE = "September 2026";
const MAX_WEEK_HEADING_SAMPLE = "Sep 30 - Sep 30, 2026";
const MAX_DAY_HEADING_SAMPLE = "Wed Aug 30";
const DRAFT_MOVE_PREVIEW_REFRESH_DELAY_MS = 200;
const SCOPE_ONLY_ELIGIBILITY_REASONS = new Set([
  "end_outside_scope",
  "starts_after_scope",
]);
const ELIGIBILITY_REASON_LABELS: Record<string, string> = {
  not_owner: "Only goals you own can be planned here.",
  group_goal: "Group goals are excluded from personal planner scheduling.",
  deleted: "Deleted goals are excluded from planning.",
  archived: "Archived goals are excluded from planning.",
  linked: "Linked goals are managed by their source relationship.",
  missing_end_date:
    "This goal needs a deadline before it can be planned in Calendar.",
  invalid_date_range: "The goal dates are invalid (start is after end).",
  horizon_too_long:
    "This goal deadline exceeds the 24-month planning horizon limit.",
};

function getEligibilityReasonLabel(reason: string) {
  return ELIGIBILITY_REASON_LABELS[reason] ?? "This goal is currently ineligible.";
}

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
  const [context, setContext] = useState<PlannerContextPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
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
  const dayPreviewRef = useRef<HTMLDivElement | null>(null);

  const timezoneOptions = useMemo(() => {
    const intlWithSupportedValues = Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    };
    const supportedTimezones =
      typeof intlWithSupportedValues.supportedValuesOf === "function"
        ? intlWithSupportedValues.supportedValuesOf("timeZone")
        : [];
    const detectedTimezone = resolveUserTimezone();
    return Array.from(
      new Set(
        [setupTimezone, detectedTimezone, "UTC", ...supportedTimezones].filter(
          (timezone): timezone is string => Boolean(timezone)
        )
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [setupTimezone]);

  const loadContext = useCallback(
    async ({
      showLoading = true,
      toastOnError = false,
    }: {
      showLoading?: boolean;
      toastOnError?: boolean;
    } = {}) => {
    if (activeTab !== "calendar") {
      return false;
    }

    if (showLoading) {
      setError(null);
    }
    if (!month) {
      const resolvedMonth = getMonthInTimezone(setupTimezone);
      onMonthChange(resolvedMonth, "replace");
      return true;
    }

    if (showLoading) {
      setLoading(true);
    }
    let contextPayload: PlannerContextPayload;
    try {
      contextPayload = await getJson<PlannerContextPayload>("/api/planner/context", {
        query: { scopeMonth: month },
      });
    } catch (error) {
      if (showLoading) {
        setLoading(false);
      }
      const message = getApiErrorMessage(
        error,
        "Planner calendar context could not be loaded."
      );
      if (showLoading) {
        setContext(null);
        setError(message);
      }
      if (toastOnError) {
        toast.error(message);
      }
      return false;
    }
    if (showLoading) {
      setLoading(false);
    }

    setContext(contextPayload);
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
  const draftCommandsForSaveByScope = useMemo(() => {
    const commandsByScope: Record<string, PlannerDraftCommand[]> = {};
    for (const scopeMonth of dirtyScopeMonths) {
      const scopedCommands = sortPlannerDraftCommands(
        selectDraftCommandsForScope(draftCommandState, scopeMonth)
      );
      const previewForScope =
        scopeMonth === currentScopeMonth
          ? effectivePreview
          : draftPreviewByScope[scopeMonth] ?? visibleMonthContexts[scopeMonth]?.preview;
      if (!previewForScope) {
        commandsByScope[scopeMonth] = scopedCommands;
        continue;
      }
      const previewEntryKeys = new Set(
        (previewForScope.workUnits ?? []).map((unit) =>
          draftCommandEntryKey({
            goalId: unit.originalGoalId,
            unitKey: unit.unitKey,
          })
        )
      );
      commandsByScope[scopeMonth] = scopedCommands.filter((command) =>
        previewEntryKeys.has(draftCommandEntryKey(command))
      );
    }
    return commandsByScope;
  }, [
    currentScopeMonth,
    dirtyScopeMonths,
    draftCommandState,
    draftPreviewByScope,
    effectivePreview,
    visibleMonthContexts,
  ]);
  const currentScopeHasDraftSession = currentScopeMonth
    ? dirtyScopeMonths.includes(currentScopeMonth)
    : false;
  const hasDraftSession = dirtyScopeMonths.length > 0;
  const horizonCounter = useMemo(() => {
    const summary = effectivePreview?.horizonSummary ?? [];
    if (summary.length === 0) {
      return null;
    }
    const total = summary.reduce((count, goal) => count + goal.totalCount, 0);
    if (total <= 0) {
      return null;
    }
    const thisMonth = summary.reduce(
      (count, goal) => count + goal.scopeMonthPlannedCount,
      0
    );
    const remaining = summary.reduce(
      (count, goal) => count + goal.remainingCount,
      0
    );
    return { thisMonth, total, remaining };
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
  const getEntriesForDay = useCallback(
    (day: string | null) => getCalendarDayProjection(day).entries,
    [getCalendarDayProjection]
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
    return getOrderedEntriesForDay(effectiveSelectedDay);
  }, [effectiveSelectedDay, getOrderedEntriesForDay]);
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
    if (!dayPreview?.pinned) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (dayPreviewRef.current?.contains(target)) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest('[data-day-cell="true"]')
      ) {
        return;
      }
      setDayPreview(null);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [dayPreview?.pinned]);

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

    onPlannerMutation();
    setDraftPolicyByScope({});
    setDraftPreviewByScope({});
    dispatchDraftCommand({ type: "clear" });
    setSettingsOpen(false);
    if (!month) {
      onMonthChange(getMonthInTimezone(setupTimezone), "replace");
    } else {
      await loadContext();
    }
    toast.success("Planner setup saved.");
  };

  const draftMoveRefreshTimerRef = useRef<number | null>(null);
  const draftSaveCommands = useMemo(
    () => effectiveDraftCommands,
    [effectiveDraftCommands]
  );

  const requestPreviewForScope = useCallback(
    async ({
      scopeMonth,
      nextPolicy,
      solveIntent,
      draftCommands,
    }: {
      scopeMonth: string;
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
            scopeMonth,
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
    if (!context?.scopeMonth) {
      throw new Error("Planner context is unavailable.");
    }
    return requestPreviewForScope({
      scopeMonth: context.scopeMonth,
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
  useEffect(
    () => () => {
      if (draftMoveRefreshTimerRef.current !== null) {
        window.clearTimeout(draftMoveRefreshTimerRef.current);
      }
    },
    []
  );

  const refreshDraftPreview = async (nextPolicy: PlannerPolicy) => {
    const preview = await requestPreview(
      nextPolicy,
      "stable",
      draftSaveCommandsRef.current
    );
    if (context?.scopeMonth) {
      setDraftPreviewForScope(context.scopeMonth, preview);
    }
    return preview;
  };

  /**
   * Draft pins are part of `generationInputHash`, so the preview on screen goes
   * stale the moment a move is dispatched and save would reject it. Re-solve to
   * refresh the hash, and to surface a move the solver cannot honor (outside the
   * placement window, colliding with a lock) while the user is still looking at
   * the calendar rather than at publish time.
   */
  const draftMoveRefreshRunnerRef = useRef<() => void>(() => {});
  useEffect(() => {
    draftMoveRefreshRunnerRef.current = () => {
      const refreshPolicy =
        effectiveDraftPolicy ?? context?.preferences?.defaultPolicy ?? null;
      if (!context?.scopeMonth || !refreshPolicy) {
        return;
      }
      void refreshDraftPreview(refreshPolicy).catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Preview could not be regenerated for that move."
        );
      });
    };
  });

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
    const scopeMonth = context.scopeMonth;
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
        type: "upsert_move",
        scopeMonth,
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
        scheduledDate: nextDate,
      } as const;
      dispatchDraftCommand(action);
      nextState = draftCommandReducer(nextState, action);
      movedEntryKeys.push(entryKey);
    }

    // Keep the ref ahead of the reducer so the stable refresh that follows
    // sends the pins we just created rather than the previous render's list.
    draftSaveCommandsRef.current = sortPlannerDraftCommands(
      selectDraftCommandsForScope(nextState, scopeMonth)
    );
    return { moveCount: movedEntryKeys.length, movedEntryKeys };
  };

  const clearDraftMoveCommands = (entryKeys: string[]) => {
    if (!context?.scopeMonth || entryKeys.length === 0) {
      return;
    }
    const scopeMonth = context.scopeMonth;
    let nextState = draftCommandState;
    for (const entryKey of entryKeys) {
      const separatorIndex = entryKey.indexOf(":");
      const action = {
        type: "remove_kind",
        scopeMonth,
        kind: "move_item",
        goalId: entryKey.slice(0, separatorIndex),
        unitKey: entryKey.slice(separatorIndex + 1),
      } as const;
      dispatchDraftCommand(action);
      nextState = draftCommandReducer(nextState, action);
    }
    draftSaveCommandsRef.current = sortPlannerDraftCommands(
      selectDraftCommandsForScope(nextState, scopeMonth)
    );
  };

  const scheduleDraftMovePreviewRefresh = useCallback(() => {
    if (draftMoveRefreshTimerRef.current !== null) {
      window.clearTimeout(draftMoveRefreshTimerRef.current);
    }
    draftMoveRefreshTimerRef.current = window.setTimeout(() => {
      draftMoveRefreshTimerRef.current = null;
      draftMoveRefreshRunnerRef.current();
    }, DRAFT_MOVE_PREVIEW_REFRESH_DELAY_MS);
  }, []);

  const nonPublishablePreviewMessage = useCallback(
    (
      preview: NonNullable<PlannerContextPayload["preview"]>,
      scopeMonth: string | null = context?.scopeMonth ?? null
    ) => {
      if (context && scopeMonth && scopeMonth < context.asOfDate.slice(0, 7)) {
        return "Publishing an elapsed month is not supported. Publish the current or a future month.";
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
    getNonPublishablePreviewMessage: nonPublishablePreviewMessage,
  });

  const isValidIsoDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const parsed = parse(value, "yyyy-MM-dd", new Date());
    return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value;
  };

  const clearHoverPreviewTimer = () => {
    if (hoverPreviewTimerRef.current) {
      window.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = null;
    }
  };

  const clearHoverPreviewCloseTimer = () => {
    if (hoverPreviewCloseTimerRef.current) {
      window.clearTimeout(hoverPreviewCloseTimerRef.current);
      hoverPreviewCloseTimerRef.current = null;
    }
  };

  const scheduleHoverPreviewClose = (day: string) => {
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
  };

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
    for (const [day, entries] of entriesByDate.entries()) {
      for (const entry of entries) {
        if (entry.draftGhost) {
          continue;
        }
        const key = `${entry.originalGoalId}:${day}`;
        const existing = map.get(key) ?? new Set<string>();
        existing.add(entry.key);
        map.set(key, existing);
      }
    }
    return map;
  }, [entriesByDate]);

  const queueDraftMoveCommand = useCallback(
    ({
      entry,
      nextDate,
      source,
    }: {
      entry: PlannerDayDetailEntry;
      nextDate: string;
      source: "date_input" | "drag_drop";
    }) => {
      if (entry.draftGhost) {
        toast.error("Original-date preview markers cannot be moved directly.");
        return false;
      }
      const normalized = nextDate.trim();
      if (!isValidIsoDate(normalized)) {
        toast.error("Pick a valid move date.");
        return false;
      }
      if (!context?.scopeMonth) {
        return false;
      }
      if (isEntryImmovableForDraft(entry)) {
        toast.error(
          "Completed or historical sessions cannot move in preview mode. Clear completion in the saved plan first."
        );
        return false;
      }
      const baselineUnit = previewUnitByEntryKey.get(entry.key);
      if (!baselineUnit) {
        toast.error("This session is unavailable in the current preview.");
        return false;
      }
      const moveWindow = baselineUnit?.draftMoveWindow ?? baselineUnit?.placementWindow;
      if (!moveWindow) {
        toast.error("This session does not have a movable placement window.");
        return false;
      }
      if (
        normalized < moveWindow.start ||
        normalized > moveWindow.end
      ) {
        const creditWindowEnd = baselineUnit.creditWindow?.end ?? moveWindow.end;
        if (normalized < moveWindow.start) {
          toast.error(
            `This session can only move on or after ${moveWindow.start}.`
          );
        } else if (normalized > creditWindowEnd) {
          toast.error(
            `That date is after this session's credit window end (${creditWindowEnd}), which usually reflects the goal end date or cadence period boundary.`
          );
        } else {
          toast.error(
            `That date is outside this session's allowed planner window (${moveWindow.start} to ${moveWindow.end}).`
          );
        }
        return false;
      }
      const collisionKey = `${entry.originalGoalId}:${normalized}`;
      const conflictKeys = moveConflictByGoalDate.get(collisionKey);
      if (
        conflictKeys &&
        (conflictKeys.size > 1 || !conflictKeys.has(entry.key))
      ) {
        toast.error(
          "That goal already has a planner session on the selected date."
        );
        return false;
      }
      const completionFactConflict = (
        completionFactUnitsByGoalDate.get(collisionKey) ?? []
      ).find((unit) => unit.unitKey !== entry.unitKey);
      if (completionFactConflict) {
        if (
          completionFactConflict.scheduledDate &&
          completionFactConflict.scheduledDate !== normalized
        ) {
          toast.error(
            `That goal is already marked done on ${normalized} (credited from the ${completionFactConflict.scheduledDate} session).`
          );
        } else {
          toast.error("That date already has a completion fact for this goal.");
        }
        return false;
      }

      const scopeMonth = context.scopeMonth;
      dispatchDraftCommand({
        type: "upsert_move",
        scopeMonth,
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        scheduledDate: normalized,
      });
      scheduleDraftMovePreviewRefresh();
      if (source === "drag_drop") {
        toast.success(
          `Moved ${getEntryDisplayTitle(entry)} in preview mode to ${normalized}.`
        );
      }
      return true;
    },
    [
      scheduleDraftMovePreviewRefresh,
      completionFactUnitsByGoalDate,
      context?.scopeMonth,
      moveConflictByGoalDate,
      previewUnitByEntryKey,
    ]
  );

  const updateDraftLabel = (entry: PlannerDayDetailEntry, label: string) => {
    if (entry.draftGhost) {
      return;
    }
    if (!context?.scopeMonth) {
      return;
    }
    const scopeMonth = context.scopeMonth;
    const baselineTitle =
      entry.activeGoal?.title ?? context?.goalTitles?.[entry.originalGoalId] ?? null;
    if (!label || label === baselineTitle) {
      dispatchDraftCommand({
        type: "remove_kind",
        scopeMonth,
        kind: "rename_item",
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
      });
      return;
    }
    dispatchDraftCommand({
      type: "upsert_rename",
      scopeMonth,
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
    const scopeMonth = context.scopeMonth;
    const baselineOverride =
      previewUnitByEntryKey.get(entry.key)?.scheduledTimeOverride ??
      entry.activeItem?.scheduled_time_override ??
      null;
    const nextPlan = planDraftTimeOverrideUpdate({
      scopeMonth,
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
    []
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
      const movingCompleted = completedKeys.includes(activeEntryKey);
      const targetGroupKeys = movingCompleted ? completedKeys : incompleteKeys;
      if (
        !targetGroupKeys.includes(activeEntryKey) ||
        !targetGroupKeys.includes(overEntryKey)
      ) {
        return;
      }
      setPreviewEntryOrderByDay((previous) => {
        const fallbackOrder = [...incompleteKeys, ...completedKeys];
        const existing = previous[day] ?? fallbackOrder;
        const normalized = [
          ...existing.filter((entryKey) => fallbackOrder.includes(entryKey)),
          ...fallbackOrder.filter((entryKey) => !existing.includes(entryKey)),
        ];
        const groupOrder = normalized.filter((entryKey) =>
          targetGroupKeys.includes(entryKey)
        );
        const fromIndex = groupOrder.indexOf(activeEntryKey);
        const toIndex = groupOrder.indexOf(overEntryKey);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return previous;
        }
        const nextGroupOrder = moveItemInArray(groupOrder, fromIndex, toIndex);
        const stableIncomplete = movingCompleted
          ? normalized.filter((entryKey) => incompleteKeys.includes(entryKey))
          : nextGroupOrder;
        const stableCompleted = movingCompleted
          ? nextGroupOrder
          : normalized.filter((entryKey) => completedKeys.includes(entryKey));
        const next = [...stableIncomplete, ...stableCompleted];
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
  ): {
    currentlyCredited: boolean;
    desiredFactState: "present" | "absent";
    decision: CompletionDispatchDecision;
  } | null => {
    if (!context || !selectedDate) {
      return null;
    }

    const requirementKind =
      entry.activeItem?.requirement_kind ??
      (entry.unitKey.startsWith("milestone:")
        ? "milestone_sequence"
        : entry.unitKey.startsWith("cadence:")
          ? "cadence"
          : "deadline_total");
    // When a session is not part of an active published plan yet, we still
    // prefer exact-date completion behavior from the calendar surface.
    const targetedRecurring =
      requirementKind === "deadline_total" || !entry.activeGoal;
    const currentlyCredited =
      entry.creditState !== "uncredited" || Boolean(entry.activeItem?.credited_completion_id);
    const desiredFactState = currentlyCredited ? "absent" : "present";
    const matchingItemState =
      entry.classification === "satisfied_elsewhere"
        ? "satisfied_elsewhere"
        : entry.classification.startsWith("historical")
          ? "historical"
          : entry.activeItem
            ? "actionable"
            : "none";
    const selectedDateState =
      selectedDate < context.asOfDate
        ? "past"
        : selectedDate > context.asOfDate
          ? "future"
          : "today";

    const decision = resolveCompletionDispatch({
      requirementKind,
      targetedRecurring,
      activePlanMembership: Boolean(entry.activeGoal),
      matchingItemState,
      selectedDateState,
      existingExactFact: currentlyCredited,
      desiredFactState,
    });

    return {
      currentlyCredited,
      desiredFactState,
      decision,
    };
  };

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
        onPlannerMutation();
        const refreshed = await withPlannerRefreshTimeout({
          operation: loadContext({
            showLoading: false,
            toastOnError: false,
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
        toast.success(nextLocked ? "Planner item locked." : "Planner item unlocked.");
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
      if (hasDraftSession) {
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

      onPlannerMutation();
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
      toast.success(desiredFactState === "present" ? "Marked done." : "Marked not done.");
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
    const expectedDigest = context.revisions.scheduleDigest;
    if (!expectedDigest) {
      toast.error("Planner state is stale. Refresh and regenerate the preview.");
      return;
    }
    const scopeMonthsToPublish = hasDraftSession
      ? dirtyScopeMonths
      : context.scopeMonth
        ? [context.scopeMonth]
        : [];
    if (scopeMonthsToPublish.length === 0) {
      return;
    }

    setSaveLoading(true);
    let payload: PlannerErrorPayload & {
      replayed?: boolean;
      publishedScopes?: string[];
    };
    try {
      const scopePayloads: Array<{
        scopeMonth: string;
        previewHash: string;
        confirmationHash: string | null;
        policy?: PlannerPolicy;
        eligibilityMode: string;
        draftCommands: PlannerDraftCommand[];
        preserveExistingAssignments: boolean;
      }> = [];
      for (const scopeMonth of scopeMonthsToPublish) {
        const scopeDraftCommands = draftCommandsForSaveByScope[scopeMonth] ?? [];
        const scopeDraftPolicy = draftPolicyByScope[scopeMonth] ?? null;
        let scopePreview =
          scopeMonth === context.scopeMonth
            ? effectivePreview
            : draftPreviewByScope[scopeMonth] ??
              visibleMonthContexts[scopeMonth]?.preview ??
              null;
        if (!scopePreview) {
          const refreshPolicy =
            scopeDraftPolicy ?? context.preferences?.defaultPolicy ?? null;
          if (!refreshPolicy) {
            toast.error(
              `Preview for ${scopeMonth} is unavailable. Open that month and regenerate before saving.`
            );
            return;
          }
          scopePreview = await requestPreviewForScope({
            scopeMonth,
            nextPolicy: refreshPolicy,
            solveIntent: "stable",
            draftCommands: scopeDraftCommands,
          });
          setDraftPreviewForScope(scopeMonth, scopePreview);
        }
        if (!scopePreview) {
          toast.error(
            `Preview for ${scopeMonth} is unavailable. Open that month and regenerate before saving.`
          );
          return;
        }
        const publishBlockedByElapsedMonth =
          scopeMonth < context.asOfDate.slice(0, 7);
        if (publishBlockedByElapsedMonth || !scopePreview.solver.publishable) {
          toast.error(
            `${scopeMonth}: ${nonPublishablePreviewMessage(scopePreview, scopeMonth)}`
          );
          return;
        }
        const confirmationHash = scopePreview.solver.confirmationRequired
          ? buildPlannerConfirmationHash({
              previewHash: scopePreview.generationInputHash,
              issueCodes: scopePreview.solver.issueCodes,
            })
          : null;
        scopePayloads.push({
          scopeMonth,
          previewHash: scopePreview.generationInputHash,
          eligibilityMode: scopePreview.eligibilityMode,
          confirmationHash,
          policy: scopeDraftPolicy ?? undefined,
          preserveExistingAssignments: scopePreview.preserveExistingAssignments,
          draftCommands: scopeDraftCommands,
        });
      }
      try {
        payload = await postJson<
          PlannerErrorPayload & {
            replayed?: boolean;
            publishedScopes?: string[];
          }
        >(
          "/api/planner/save",
          {
            expectedDigest,
            scopes: scopePayloads,
          }
        );
      } catch (error) {
        if (isApiClientError(error) && error.code === "planner_not_publishable") {
          const issueCodes = Array.isArray(error.details?.issueCodes)
            ? error.details.issueCodes.filter(
                (value): value is string => typeof value === "string"
              )
            : [];
          const detailSuffix =
            issueCodes.length > 0 ? ` (${issueCodes.join(", ")})` : "";
          const scopedPrefix =
            typeof error.details?.scopeMonth === "string"
              ? `${error.details.scopeMonth}: `
              : "";
          toast.error(
            `${scopedPrefix}${
              error.message ?? "Planner save is currently blocked."
            }${detailSuffix}`
          );
          return;
        }
        toast.error(getApiErrorMessage(error, "Planner save failed."));
        return;
      }
      try {
        for (const scopeMonth of scopeMonthsToPublish) {
          clearDraftScopeSession(scopeMonth);
        }
        onPlannerMutation();
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
        coach.actions.resetForPlannerStateReset();
        const publishedScopeCount = scopeMonthsToPublish.length;
        if (publishedScopeCount > 1) {
          toast.success(
            payload.replayed
              ? `Save replayed across ${publishedScopeCount} months.`
              : `Saved ${publishedScopeCount} months.`
          );
        } else {
          toast.success(payload.replayed ? "Save replayed." : "Plan saved.");
        }
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
        clearDraftScopeSession(context.scopeMonth);
        onPlannerMutation();
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

  const discardDraftChanges = (mode: "current" | "all" = "current") => {
    const scopesToClear =
      mode === "all"
        ? dirtyScopeMonths
        : context?.scopeMonth
          ? [context.scopeMonth]
          : [];
    if (scopesToClear.length === 0) {
      return;
    }
    for (const scopeMonth of scopesToClear) {
      clearDraftScopeSession(scopeMonth);
    }
    coach.actions.onDraftDiscarded();
    toast.success(
      scopesToClear.length > 1
        ? `Reverted preview changes for ${scopesToClear.length} months.`
        : "Preview changes reverted to the saved baseline."
    );
  };

  const canShowSetup = !context?.preferences;
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
  const viewHeading =
    viewMode === "month"
      ? monthLabel
      : viewMode === "week"
        ? `${format(focusedWeekStartDate, "MMM d")} - ${format(
            focusedWeekEndDate,
            "MMM d, yyyy"
          )}`
        : format(safeFocusedDay, "EEE MMM d");
  const viewHeadingControlWidth = `min(100%, calc(${Math.max(
    monthLabel.length,
    MAX_MONTH_HEADING_SAMPLE.length,
    MAX_WEEK_HEADING_SAMPLE.length,
    MAX_DAY_HEADING_SAMPLE.length
  )}ch + ${viewMode === "month" ? "11rem" : "8rem"}))`;
  const viewDescription =
    viewMode === "month"
      ? `${restWeekdayOptions.find((option) => option.value === weekStartsOn)?.label ?? "Mon"}-first month view. Drag session pills to stage preview edits.`
      : viewMode === "week"
        ? "Expanded 7-day planner view with drag-and-drop editing."
        : "Day agenda view with completion and detail controls.";
  const previousWindowAriaLabel =
    viewMode === "month"
      ? "Previous month"
      : viewMode === "week"
        ? "Previous week"
        : "Previous day";
  const nextWindowAriaLabel =
    viewMode === "month"
      ? "Next month"
      : viewMode === "week"
        ? "Next week"
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
    setDayPreview(null);
    onViewModeChange(nextViewMode, "push");
  };
  const scopeMonthsForSaveAction =
    hasDraftSession && dirtyScopeMonths.length > 0
      ? dirtyScopeMonths
      : context?.scopeMonth
        ? [context.scopeMonth]
        : [];
  const blockedSaveScope = (() => {
    if (!context) {
      return null;
    }
    for (const scopeMonth of scopeMonthsForSaveAction) {
      const previewForScope =
        scopeMonth === context.scopeMonth
          ? effectivePreview
          : draftPreviewByScope[scopeMonth] ?? visibleMonthContexts[scopeMonth]?.preview;
      if (!previewForScope) {
        continue;
      }
      if (
        scopeMonth < context.asOfDate.slice(0, 7) ||
        !previewForScope.solver.publishable
      ) {
        return {
          scopeMonth,
          message: nonPublishablePreviewMessage(previewForScope, scopeMonth),
        };
      }
    }
    return null;
  })();
  const draftSaveBlocked = blockedSaveScope !== null;
  const draftSaveBlockedMessage = blockedSaveScope
    ? `${blockedSaveScope.scopeMonth}: ${blockedSaveScope.message}`
    : null;
  const hasLockedPlanItems = Boolean(
    context?.activePlan?.items.some((item) => item.locked)
  );
  const canResetPlan = Boolean(
    !hasDraftSession && hasLockedPlanItems
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
  const openDayDetails = (day: string) => {
    clearHoverPreviewTimer();
    clearHoverPreviewCloseTimer();
    setDayPreview(null);
    setLocalSelectedDay(day);
    setSelectedEventEntryKey(null);
  };
  const renderCalendarDayCell = (cell: { date: string; inMonth: boolean }) => {
    const dayProjection = getCalendarDayProjection(cell.date);
    const entriesForDay = dayProjection.orderedEntries;
    const completionFactMarkersForDay = dayProjection.completionFactMarkers;
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
          viewMode === "week"
            ? Number.MAX_SAFE_INTEGER
            : expandedMonthRows
              ? Number.MAX_SAFE_INTEGER
              : 2
        }
        isAnyEntryDragging={Boolean(draggingEntryKey)}
        getEntryDisplayTitle={getEntryDisplayTitleWithTime}
        isEntryCredited={isEntryCredited}
        isEntryImmovableForDraft={(entry) =>
          !canMutateEntryOnDay(entry, cell.date) || isEntryImmovableForDraft(entry)
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
          handleDayCellClick(cell.date, target);
        }}
        onCellMouseEnter={(target) => {
          scheduleHoverPreview(cell.date, target);
        }}
        onCellMouseLeave={() => {
          clearHoverPreviewTimer();
          scheduleHoverPreviewClose(cell.date);
        }}
        onCellPointerDown={(pointerType, target) => {
          pointerPressActiveRef.current = true;
          clearHoverPreviewTimer();
          if (pointerType === "touch") {
            startLongPressPreview(cell.date, target);
          }
        }}
        onCellPointerUp={() => {
          pointerPressActiveRef.current = false;
          clearLongPressTimer();
        }}
        onCellPointerCancel={() => {
          pointerPressActiveRef.current = false;
          clearLongPressTimer();
        }}
        onCellPointerLeave={() => {
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

  const setupForm = (
    <div className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span>Timezone (IANA)</span>
        <Select value={setupTimezone} onValueChange={setSetupTimezone}>
          <SelectTrigger>
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {timezoneOptions.map((timezone) => (
              <SelectItem key={timezone} value={timezone}>
                {timezone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="block space-y-1 text-sm">
        <span>First day of week</span>
        <Select
          value={`${setupWeekStartsOn}`}
          onValueChange={(value) =>
            setSetupWeekStartsOn(
              normalizeWeekStartsOn(Number.parseInt(value, 10))
            )
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {restWeekdayOptions.map((option) => (
              <SelectItem key={option.value} value={`${option.value}`}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
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
      <Button type="button" onClick={submitSetup} disabled={setupLoading}>
        {setupLoading ? "Saving setup..." : "Save setup"}
      </Button>
    </div>
  );

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
                  onClick={() => discardDraftChanges("current")}
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
                  onClick={() => discardDraftChanges("all")}
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
          {setupForm}
        </div>
      ) : month ? (
        <>
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
                  <PeriodStepper
                    className="contents"
                    onPrevious={() => moveViewWindow(-1)}
                    onNext={() => moveViewWindow(1)}
                    previousDisabled={loading}
                    nextDisabled={loading}
                    previousAriaLabel={previousWindowAriaLabel}
                    nextAriaLabel={nextWindowAriaLabel}
                    center={
                      <h3 className="truncate text-center text-base font-semibold">
                        {viewHeading}
                      </h3>
                    }
                  />
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
                  {PLANNER_VIEW_MODES.map((modeOption) => (
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
                      <p className="mb-2 text-sm font-medium">
                        {format(parse(focusedDay, "yyyy-MM-dd", new Date()), "EEE MMM d")}
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
                          openDayDetails(focusedDay);
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
                      />
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
                      {(viewMode === "week" ? focusedWeekCells : cells).map(
                        renderCalendarDayCell
                      )}
                    </div>
                  </>
                )}
                {draftSaveBlockedMessage ? (
                  <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs">
                    <p className="font-medium">Preview save is currently blocked.</p>
                    <p className="mt-1 text-muted-foreground">
                      {draftSaveBlockedMessage}
                    </p>
                  </div>
                ) : null}

                {viewMode !== "day" && dayPreview ? (
                  <div
                    ref={dayPreviewRef}
                    data-motion="planner-day-preview"
                    className="motion-popup-enter fixed z-40 rounded-lg border bg-card p-3 shadow-lg"
                    style={{
                      top: dayPreview.position.top,
                      left: dayPreview.position.left,
                      width: dayPreview.position.width,
                      transformOrigin:
                        dayPreview.position.placement === "above"
                          ? "bottom center"
                          : "top center",
                      transform:
                        dayPreview.position.placement === "above"
                          ? "translateY(-100%)"
                          : undefined,
                    }}
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
                      scheduleHoverPreviewClose(dayPreview.day);
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {format(
                          parse(dayPreview.day, "yyyy-MM-dd", new Date()),
                          "EEEE, MMM d"
                        )}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            setDayPreview(null);
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
                            onClick={() => setDayPreview(null)}
                          >
                            X
                          </Button>
                        ) : null}
                      </div>
                    </div>
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
                      openDayDetails(dayPreview.day);
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
                  </div>
                ) : null}
              </div>
            </PlannerDndProvider>
          </div>

          <PlannerCoachPanel coach={coach} />

          <Dialog
            open={Boolean(effectiveSelectedDay)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedEventEntryKey(null);
                setLocalSelectedDay(null);
              }
            }}
          >
            <DialogContent
              className="top-auto bottom-0 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl"
              aria-describedby="planner-day-detail-description"
            >
              <DialogHeader>
                <DialogTitle>
                  {effectiveSelectedDay
                    ? format(
                        parse(effectiveSelectedDay, "yyyy-MM-dd", new Date()),
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
                        const visual = getGoalVisual({
                          goalId: entry.originalGoalId,
                          color: entry.activeGoal?.color ?? null,
                        });
                        const Icon = visual.Icon;
                        const displayTitle = getEntryDisplayTitleWithTime(entry);
                        const subtitle = getEntrySubtitle(entry);
                        const credited = isEntryCredited(entry);
                        const draftDiffSummary = getEntryDraftDiffSummary(entry);
                        const pillToneClasses = getEntryDraftPillClasses({
                          draftDiffKind: entry.draftDiffKind,
                          credited,
                        });
                        const completionDispatch = getDateFactDispatchForEntry(entry);
                        const completionDisabledReason =
                          completionControlDisabledReasonForEntry(
                            entry,
                            completionDispatch
                          );
                        return (
                          <li
                            key={entry.key}
                            className={`rounded-xl border p-2 ${pillToneClasses} ${
                              entry.draftGhost ? "opacity-75" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                className="flex-1 text-left text-sm transition-colors hover:text-primary"
                                onClick={() => {
                                  if (!entry.draftGhost) {
                                    setSelectedEventEntryKey(entry.key);
                                  }
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-flex size-5 items-center justify-center rounded-full"
                                    style={{ backgroundColor: visual.color }}
                                  >
                                    <Icon className="size-3 text-white" />
                                  </span>
                                  <p className="font-medium">{displayTitle}</p>
                                </div>
                                {subtitle ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {subtitle}
                                  </p>
                                ) : null}
                                {draftDiffSummary ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {draftDiffSummary}
                                  </p>
                                ) : null}
                                <p className="mt-1 text-xs text-primary">
                                  {entry.draftGhost
                                    ? "Original date marker"
                                    : "View event details"}
                                </p>
                              </button>
                              {!entry.draftGhost ? (
                                <CompletionToggle
                                  completed={Boolean(
                                    completionDispatch?.currentlyCredited
                                  )}
                                  size="md"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void toggleDateFact(
                                      entry,
                                      undefined,
                                      event.currentTarget
                                    );
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
                                      ? completionDisabledReasonCopy(
                                          completionDisabledReason
                                        )
                                      : "Toggle completion for this session"
                                  }
                                />
                              ) : null}
                            </div>
                            {completionDisabledReason ? (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {completionDisabledReasonCopy(
                                  completionDisabledReason
                                )}
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
                setSelectedEventEntryKey(null);
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
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1"
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
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planner settings</DialogTitle>
            <DialogDescription>
              Update timezone and default planning policy for future previews.
            </DialogDescription>
          </DialogHeader>
          {setupForm}
        </DialogContent>
      </Dialog>
    </div>
  );
}
