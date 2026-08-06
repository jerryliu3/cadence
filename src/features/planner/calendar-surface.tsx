"use client";

import { addDays, addMonths, format, isValid, parse } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildActiveGoalIndexes,
  buildCoachSummaryWorkUnits,
  buildCompletionFactMarkersByDate,
  buildCompletionFactUnitsByGoalDate,
  buildEntriesByDate,
  buildEntryByKey,
  buildEntryDayByKey,
  buildPreviewUnitByEntryKey,
  orderEntriesForDay as orderEntriesForDayFromState,
} from "@/features/planner/calendar-entries";
import {
  completionDisabledReasonCopy,
  createClientUuid,
  getEntryDraftDiffSummary,
  getEntryDraftPillClasses,
  getDayStatus,
  getEntryDisplayTitle,
  getEntrySubtitle,
  getMonthInTimezone,
  isEntryCredited,
  isEntryImmovableForDraft,
  monthToLabel,
  monthWeekdayLabels,
  moveItemInArray,
  parseMonth,
  restWeekdayOptions,
} from "@/features/planner/calendar-format";
import {
  type PlannerDragTarget,
  PlannerDndProvider,
} from "@/features/planner/calendar-dnd";
import { CalendarDayPreviewList } from "@/features/planner/calendar-day-preview-list";
import { CalendarMonthDayCell } from "@/features/planner/calendar-month-day-cell";
import {
  buildCoachSessionKey,
  COACH_SESSION_MAX_MESSAGES,
  loadCoachSession,
  saveCoachSession,
} from "@/features/planner/coach-session";
import {
  draftCommandReducer,
  initialDraftCommandState,
} from "@/features/planner/draft-command-reducer";
import { buildMondayFirstMonthCells } from "@/features/planner/month-cells";
import { applyCoachPolicyPatches } from "@/features/planner/coach-policy";
import { buildCoachDeterministicSummary } from "@/features/planner/coach-context";
import { computeDayPreviewPosition } from "@/features/planner/day-preview-popup";
import { getGoalVisual } from "@/features/planner/goal-visuals";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  type CompletionDispatchDecision,
  executeCompletionDispatch,
  resolveCompletionDispatch,
} from "@/lib/planner/completion-dispatch";
import type { CoachPolicyPatch } from "@/lib/planner/coach";
import {
  projectPlannerDraftCommands,
  sortPlannerDraftCommands,
} from "@/lib/planner/draft-commands";
import { buildPlannerConfirmationHash } from "@/lib/planner/publish-payload";
import {
  compilePlannerPolicy,
  createDefaultPlannerPolicy,
  isDateAllowedByPolicy,
  plannerPolicySchema,
  type PlannerPolicy,
} from "@/lib/planner/policy";
import type {
  CalendarSurfaceProps,
  CoachLastProposalMeta,
  CoachMessage,
  CoachResponsePayload,
  CompletionControlDisabledReason,
  DayPreviewState,
  DraftItemEdit,
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerErrorPayload,
  PlannerPreferencesPayload,
  PlannerPreviewResponsePayload,
} from "@/features/planner/calendar-surface.types";
const DAY_PREVIEW_HOVER_DELAY_MS = 500;
const DAY_PREVIEW_CLOSE_DELAY_MS = 180;
const DAY_PREVIEW_LONG_PRESS_DELAY_MS = 500;
const MAX_MONTH_HEADING_SAMPLE = "September 2026";
const MAX_WEEK_HEADING_SAMPLE = "Sep 30 - Sep 30, 2026";
const MAX_DAY_HEADING_SAMPLE = "Wed Aug 30";
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
  const [publishLoading, setPublishLoading] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [coachWarnings, setCoachWarnings] = useState<string[]>([]);
  const [coachRecommendations, setCoachRecommendations] = useState<string[]>([]);
  const [coachPendingPatches, setCoachPendingPatches] = useState<CoachPolicyPatch[]>(
    []
  );
  const [coachUnresolvedQuestions, setCoachUnresolvedQuestions] = useState<string[]>(
    []
  );
  const [coachPolicyApplying, setCoachPolicyApplying] = useState(false);
  const [coachUndoSnapshot, setCoachUndoSnapshot] = useState<{
    timezone: string;
    defaultPolicy: PlannerPolicy;
  } | null>(null);
  const [coachLastProposalMeta, setCoachLastProposalMeta] =
    useState<CoachLastProposalMeta | null>(null);
  const [draftScopeMonth, setDraftScopeMonth] = useState<string | null>(null);
  const [draftPolicy, setDraftPolicy] = useState<PlannerPolicy | null>(null);
  const [draftPreview, setDraftPreview] = useState<PlannerContextPayload["preview"] | null>(
    null
  );
  const [draftCommandState, dispatchDraftCommand] = useReducer(
    draftCommandReducer,
    initialDraftCommandState
  );
  const [coachContextEvents, setCoachContextEvents] = useState<string[]>([]);
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
  const [setupTimezone, setSetupTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [setupSpacing, setSetupSpacing] = useState<"front_load" | "even" | "flexible">(
    "flexible"
  );
  const [setupRestWeekdays, setSetupRestWeekdays] = useState<number[]>([]);
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const hoverPreviewCloseTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerPressActiveRef = useRef(false);
  const pointerInsideDayPreviewRef = useRef(false);
  const dayPreviewRef = useRef<HTMLDivElement | null>(null);

  const resetCoachUiState = useCallback((messages: CoachMessage[] = []) => {
    setCoachMessages(messages);
    setCoachWarnings([]);
    setCoachRecommendations([]);
    setCoachPendingPatches([]);
    setCoachUnresolvedQuestions([]);
    setCoachContextEvents([]);
    setCoachUndoSnapshot(null);
    setCoachLastProposalMeta(null);
  }, []);

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
      if (showLoading) {
        setLoading(true);
      }
      const response = await fetch("/api/planner/preferences", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json();
      if (showLoading) {
        setLoading(false);
      }
      if (!response.ok) {
        const errorPayload = payload as PlannerErrorPayload;
        const message = errorPayload.message ?? "Planner setup could not be loaded.";
        if (showLoading) {
          setError(message);
        }
        if (toastOnError) {
          toast.error(message);
        }
        return false;
      }
      const preferencesPayload = payload as PlannerPreferencesPayload;
      if (preferencesPayload.preferences?.timezone) {
        const resolvedMonth = getMonthInTimezone(
          preferencesPayload.preferences.timezone
        );
        onMonthChange(resolvedMonth, "replace");
        return true;
      }
      return true;
    }

    if (showLoading) {
      setLoading(true);
    }
    const query = new URLSearchParams({ scopeMonth: month });
    const response = await fetch(`/api/planner/context?${query.toString()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const payload = await response.json();
    if (showLoading) {
      setLoading(false);
    }
    if (!response.ok) {
      const errorPayload = payload as PlannerErrorPayload;
      const message =
        errorPayload.message ?? "Planner calendar context could not be loaded.";
      if (showLoading) {
        setContext(null);
        setError(message);
      }
      if (toastOnError) {
        toast.error(message);
      }
      return false;
    }

    const contextPayload = payload as PlannerContextPayload;
    setContext(contextPayload);
    if (contextPayload.preferences?.timezone) {
      setSetupTimezone(contextPayload.preferences.timezone);
      setSetupSpacing(contextPayload.preferences.defaultPolicy.spacingStrategy);
      setSetupRestWeekdays(contextPayload.preferences.defaultPolicy.restWeekdays);
    }
    return true;
  }, [activeTab, month, onMonthChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadContext();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadContext]);

  useEffect(() => {
    if (activeTab !== "calendar" || !context?.scopeMonth || !context?.timezone) {
      return;
    }
    const timer = window.setTimeout(() => {
      const restored = loadCoachSession(context.scopeMonth, context.timezone);
      resetCoachUiState(restored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, context?.scopeMonth, context?.timezone, resetCoachUiState]);

  const cells = useMemo(
    () => (month ? buildMondayFirstMonthCells(month) : []),
    [month]
  );
  const cellByDate = useMemo(
    () => new Map(cells.map((cell) => [cell.date, cell])),
    [cells]
  );
  const calendarToday =
    context?.asOfDate ??
    getDateInTimezone(new Date(), context?.timezone ?? setupTimezone);
  const focusedDay = selectedDay ?? calendarToday;
  const focusedWeekDays = useMemo(() => {
    const parsedFocusedDay = parse(focusedDay, "yyyy-MM-dd", new Date());
    const safeFocusedDay = isValid(parsedFocusedDay)
      ? parsedFocusedDay
      : parse(calendarToday, "yyyy-MM-dd", new Date());
    const mondayOffset = (safeFocusedDay.getDay() + 6) % 7;
    const weekStart = addDays(safeFocusedDay, -mondayOffset);
    return Array.from({ length: 7 }, (_, index) =>
      format(addDays(weekStart, index), "yyyy-MM-dd")
    );
  }, [calendarToday, focusedDay]);
  const focusedWeekCells = useMemo(() => {
    const monthPrefix = month ? `${month}-` : null;
    return focusedWeekDays.map((day) => {
      const existingCell = cellByDate.get(day);
      if (existingCell) {
        return existingCell;
      }
      return {
        date: day,
        inMonth: monthPrefix ? day.startsWith(monthPrefix) : false,
      };
    });
  }, [cellByDate, focusedWeekDays, month]);
  const currentScopeMonth = context?.scopeMonth ?? month;
  const draftMatchesCurrentScope =
    Boolean(currentScopeMonth) && draftScopeMonth === currentScopeMonth;
  const effectiveDraftPolicy = draftMatchesCurrentScope ? draftPolicy : null;
  const effectiveDraftPreview = draftMatchesCurrentScope ? draftPreview : null;
  const effectiveDraftCommands = useMemo(
    () =>
      draftMatchesCurrentScope
        ? sortPlannerDraftCommands(draftCommandState.commands)
        : [],
    [draftCommandState.commands, draftMatchesCurrentScope]
  );
  const effectiveDraftItemEdits = useMemo(
    () =>
      draftMatchesCurrentScope
        ? (projectPlannerDraftCommands(
            effectiveDraftCommands
          ) as Record<string, DraftItemEdit>)
        : {},
    [draftMatchesCurrentScope, effectiveDraftCommands]
  );
  const effectivePreview = effectiveDraftPreview ?? context?.preview ?? null;
  const activeGoalIndexes = useMemo(
    () => buildActiveGoalIndexes(context?.activePlan?.goals),
    [context?.activePlan?.goals]
  );
  const activeGoalsByPlanGoalId = activeGoalIndexes.byPlanGoalId;
  const activeGoalsByOriginalGoalId = activeGoalIndexes.byOriginalGoalId;

  const entriesByDate = useMemo(
    () =>
      buildEntriesByDate({
        baselineWorkUnits: context?.preview?.workUnits,
        workUnits: effectivePreview?.workUnits,
        activeItems: context?.activePlan?.items,
        activeGoalsByPlanGoalId,
        activeGoalsByOriginalGoalId,
        goalTitles: context?.goalTitles,
        draftItemEdits: effectiveDraftItemEdits,
      }),
    [
      activeGoalsByOriginalGoalId,
      activeGoalsByPlanGoalId,
      context?.goalTitles,
      context?.preview?.workUnits,
      context?.activePlan?.items,
      effectiveDraftItemEdits,
      effectivePreview?.workUnits,
    ]
  );
  const entryByKey = useMemo(() => buildEntryByKey(entriesByDate), [entriesByDate]);
  const entryDayByKey = useMemo(
    () => buildEntryDayByKey(entriesByDate),
    [entriesByDate]
  );
  const previewUnitByEntryKey = useMemo(
    () => buildPreviewUnitByEntryKey(effectivePreview?.workUnits),
    [effectivePreview?.workUnits]
  );
  const completionFactUnitsByGoalDate = useMemo(
    () => buildCompletionFactUnitsByGoalDate(effectivePreview?.workUnits),
    [effectivePreview?.workUnits]
  );
  const completionFactMarkersByDate = useMemo(
    () =>
      buildCompletionFactMarkersByDate({
        workUnits: effectivePreview?.workUnits,
        currentScopeMonth,
        activeGoalsByOriginalGoalId,
        goalTitles: context?.goalTitles,
      }),
    [
      activeGoalsByOriginalGoalId,
      context?.goalTitles,
      currentScopeMonth,
      effectivePreview?.workUnits,
    ]
  );
  const compiledPolicyForDraftMoves = useMemo(() => {
    if (!context?.preferences) {
      return null;
    }
    const sourcePolicy = effectiveDraftPolicy ?? context.preferences.defaultPolicy;
    return compilePlannerPolicy(plannerPolicySchema.parse(sourcePolicy));
  }, [context?.preferences, effectiveDraftPolicy]);
  const effectiveSelectedDay = localSelectedDay;

  const getEntriesForDay = useCallback(
    (day: string | null) => (day ? entriesByDate.get(day) ?? [] : []),
    [entriesByDate]
  );

  const orderEntriesForDay = useCallback(
    (day: string | null, entries: PlannerDayDetailEntry[]) =>
      orderEntriesForDayFromState({
        day,
        entries,
        previewEntryOrderByDay,
      }),
    [previewEntryOrderByDay]
  );

  const selectedDayEntries = useMemo(() => {
    return orderEntriesForDay(
      effectiveSelectedDay,
      getEntriesForDay(effectiveSelectedDay)
    );
  }, [effectiveSelectedDay, getEntriesForDay, orderEntriesForDay]);
  const focusedDayEntries = useMemo(
    () => orderEntriesForDay(focusedDay, getEntriesForDay(focusedDay)),
    [focusedDay, getEntriesForDay, orderEntriesForDay]
  );
  const focusedDayCompletionFactMarkers = useMemo(
    () => completionFactMarkersByDate.get(focusedDay) ?? [],
    [completionFactMarkersByDate, focusedDay]
  );
  const coachSummaryWorkUnits = useMemo(
    () => buildCoachSummaryWorkUnits(entriesByDate),
    [entriesByDate]
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

  const previewDayEntries = useMemo(
    () =>
      orderEntriesForDay(
        dayPreview?.day ?? null,
        getEntriesForDay(dayPreview?.day ?? null)
      ),
    [dayPreview?.day, getEntriesForDay, orderEntriesForDay]
  );
  const previewDayCompletionFactMarkers = useMemo(
    () => completionFactMarkersByDate.get(dayPreview?.day ?? "") ?? [],
    [completionFactMarkersByDate, dayPreview?.day]
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
    defaultPolicy.spacingStrategy = setupSpacing;

    const response = await fetch("/api/planner/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timezone: setupTimezone,
        defaultPolicy,
      }),
    });
    const payload = (await response.json()) as
      | { message?: string; preferences?: PlannerPreferencesPayload["preferences"] }
      | PlannerErrorPayload;
    setSetupLoading(false);

    if (!response.ok) {
      toast.error(payload.message ?? "Planner setup could not be saved.");
      return;
    }

    onPlannerMutation();
    setDraftScopeMonth(null);
    setDraftPolicy(null);
    setDraftPreview(null);
    dispatchDraftCommand({ type: "clear" });
    setSettingsOpen(false);
    if (!month) {
      onMonthChange(getMonthInTimezone(setupTimezone), "replace");
    } else {
      await loadContext();
    }
    toast.success("Planner setup saved.");
  };

  const appendCoachContextEvent = useCallback((event: string) => {
    setCoachContextEvents((previous) => [...previous, event].slice(-10));
  }, []);

  const coachFocusGoalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const unit of effectivePreview?.workUnits ?? []) {
      ids.add(unit.originalGoalId);
    }
    if (ids.size === 0) {
      for (const goalId of Object.keys(context?.goalTitles ?? {})) {
        ids.add(goalId);
      }
    }
    return Array.from(ids).slice(0, 20);
  }, [context?.goalTitles, effectivePreview?.workUnits]);

  const draftPublishCommands = useMemo(
    () => effectiveDraftCommands,
    [effectiveDraftCommands]
  );

  const refreshDraftPreview = async (nextPolicy: PlannerPolicy) => {
    if (!context?.scopeMonth || !context?.timezone) {
      throw new Error("Planner context is unavailable.");
    }
    const response = await fetch("/api/planner/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeMonth: context.scopeMonth,
        timezone: context.timezone,
        policy: nextPolicy,
        source: context.activePlan ? "update" : "manual",
      }),
    });
    const payload = (await response.json()) as
      | (PlannerPreviewResponsePayload & PlannerErrorPayload)
      | PlannerErrorPayload;
    if (!response.ok) {
      throw new Error(payload.message ?? "Preview refresh failed.");
    }
    const previewPayload = payload as PlannerPreviewResponsePayload;
    setDraftPreview(previewPayload.preview);
    return previewPayload.preview;
  };

  const sendCoachMessage = async () => {
    if (!context?.capabilities.coachAi || !context.scopeMonth || !context.timezone) {
      toast.error("Planner coach is currently unavailable.");
      return;
    }
    const trimmed = coachInput.trim();
    if (!trimmed) {
      return;
    }
    const userMessage: CoachMessage = {
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const nextMessages = [...coachMessages, userMessage].slice(
      -COACH_SESSION_MAX_MESSAGES
    );
    setCoachMessages(nextMessages);
    setCoachInput("");
    setCoachLoading(true);
    setCoachWarnings([]);

    const deterministicSummary = buildCoachDeterministicSummary({
      scopeMonth: context.scopeMonth,
      timezone: context.timezone,
      asOfDate: context.asOfDate,
      workUnits: coachSummaryWorkUnits,
      events: coachContextEvents,
    });

    try {
      const response = await fetch("/api/planner/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeMonth: context.scopeMonth,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          focusGoalIds: coachFocusGoalIds,
          deterministicSummary,
        }),
      });
      const payload = (await response.json()) as
        | (CoachResponsePayload & {
            message?: string;
            recommendations?: Array<{ text: string }>;
          })
        | PlannerErrorPayload;
      setCoachLoading(false);

      if (!response.ok) {
        toast.error(payload.message ?? "Coach response failed.");
        return;
      }

      const assistantMessage: CoachMessage = {
        role: "assistant",
        content: (payload as CoachResponsePayload).reply,
        createdAt: Date.now(),
      };
      const finalMessages = [...nextMessages, assistantMessage].slice(
        -COACH_SESSION_MAX_MESSAGES
      );
      setCoachMessages(finalMessages);
      saveCoachSession(context.scopeMonth, context.timezone, finalMessages);
      const coachPayload = payload as CoachResponsePayload;
      setCoachWarnings(coachPayload.warnings ?? []);
      setCoachRecommendations(
        (coachPayload.recommendations ?? []).map((item) => item.text)
      );
      const policyPatches = coachPayload.proposal?.policyPatches ?? [];
      setCoachPendingPatches(policyPatches);
      setCoachUnresolvedQuestions(coachPayload.proposal?.unresolvedQuestions ?? []);
      setCoachLastProposalMeta({
        policyPatchCount: policyPatches.length,
      });
    } catch {
      setCoachLoading(false);
      toast.error("Coach response failed.");
    }
  };

  const startNewCoachConversation = () => {
    if (context?.scopeMonth && context?.timezone) {
      sessionStorage.removeItem(buildCoachSessionKey(context.scopeMonth, context.timezone));
    }
    resetCoachUiState([]);
    setCoachInput("");
    toast.success("Started a new coach conversation.");
  };

  const parseErrorMessage = (payload: unknown, fallback: string) => {
    if (
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string" &&
      payload.message.trim().length > 0
    ) {
      return payload.message;
    }
    return fallback;
  };

  const nonPublishablePreviewMessage = (
    preview: NonNullable<PlannerContextPayload["preview"]>
  ) => {
    if (preview.solver.issueCodes.includes("invalid_lock")) {
      const affectedGoals = preview.solver.invalidGoalIds
        .slice(0, 3)
        .map((goalId) => context?.goalTitles?.[goalId] ?? goalId);
      const affectedLabel =
        affectedGoals.length > 0
          ? `Affected goals: ${affectedGoals.join(", ")}. `
          : "";
      return `${affectedLabel}Locked sessions currently conflict with this regenerated preview. Unlock affected sessions, regenerate, then publish.`;
    }
    if (preview.solver.issueCodes.length > 0) {
      return `Resolve planner issues before publishing: ${preview.solver.issueCodes.join(
        ", "
      )}.`;
    }
    return "This draft preview is not publishable yet. Regenerate and resolve planner issues before publishing.";
  };

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

  const applyCoachProposal = async () => {
    if (!context?.preferences || coachPendingPatches.length === 0) {
      return;
    }
    const allowedGoalIds = new Set<string>([
      ...Object.keys(context.goalTitles ?? {}),
      ...(context.activePlan?.goals ?? []).map((goal) => goal.original_goal_id),
    ]);
    const priorPolicy = plannerPolicySchema.parse(
      effectiveDraftPolicy ?? context.preferences.defaultPolicy
    );
    const result = applyCoachPolicyPatches({
      policy: priorPolicy,
      patches: coachPendingPatches,
      allowedGoalIds,
    });
    if (result.appliedPatchCount === 0) {
      if (
        result.noOpPatchCount > 0 &&
        result.outOfScopePatchCount === 0 &&
        result.unsupportedPatchCount === 0
      ) {
        appendCoachContextEvent("Coach proposal already matched current draft");
        toast.success(
          hasDraftSession
            ? "Coach proposal already matches your draft policy. Your manual draft edits are still pending publish."
            : "Coach proposal already matches your current policy."
        );
        return;
      }
      toast.error(
        result.outOfScopePatchCount > 0
          ? "Coach edits were received but none matched your current goal scope."
          : "No applicable policy changes were available to apply."
      );
      return;
    }

    setCoachPolicyApplying(true);
    try {
      const refreshedPreview = await refreshDraftPreview(result.policy);
      if (!refreshedPreview) {
        throw new Error("Preview refresh returned no planner data.");
      }
      const previousDatesByKey = new Map(
        (effectivePreview?.workUnits ?? []).map((unit) => [
          `${unit.originalGoalId}:${unit.unitKey}`,
          unit.scheduledDate,
        ])
      );
      const refreshedDatesByKey = new Map(
        refreshedPreview.workUnits.map((unit) => [
          `${unit.originalGoalId}:${unit.unitKey}`,
          unit.scheduledDate,
        ])
      );
      let assignmentChanges = 0;
      for (const key of new Set([
        ...previousDatesByKey.keys(),
        ...refreshedDatesByKey.keys(),
      ])) {
        if (previousDatesByKey.get(key) !== refreshedDatesByKey.get(key)) {
          assignmentChanges += 1;
        }
      }
      setDraftScopeMonth(context.scopeMonth);
      setDraftPolicy(result.policy);
      setCoachUndoSnapshot({
        timezone: context.preferences.timezone,
        defaultPolicy: priorPolicy,
      });
      appendCoachContextEvent(
        `Applied coach proposal to draft (${result.appliedPatchCount} patches)`
      );
      if (!refreshedPreview.solver.publishable) {
        toast.error(
          `Coach proposal applied, but this draft cannot publish yet. ${nonPublishablePreviewMessage(
            refreshedPreview
          )}`
        );
      } else if (assignmentChanges === 0) {
        toast.success(
          "Coach proposal applied. Policy changed, but scheduled sessions stayed the same."
        );
      } else {
        toast.success(
          `Coach proposal applied to draft preview (${assignmentChanges} session change${
            assignmentChanges === 1 ? "" : "s"
          }).`
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Coach proposal apply failed."
      );
    } finally {
      setCoachPolicyApplying(false);
    }
  };

  const rejectCoachProposal = () => {
    if (coachPendingPatches.length === 0) {
      return;
    }
    appendCoachContextEvent("Rejected coach proposal");
    setCoachPendingPatches([]);
    setCoachUnresolvedQuestions([]);
    toast.success("Coach proposal rejected.");
  };

  const requestCalendarEditsFromCoach = () => {
    const goalHint =
      coachFocusGoalIds.length > 0
        ? `Current focus goals: ${coachFocusGoalIds
            .map(
              (goalId) =>
                `${goalId} (${context?.goalTitles?.[goalId] ?? "Untitled goal"})`
            )
            .join(", ")}.`
        : "There are no focus goals in the current planner scope.";
    setCoachInput(
      `Please convert your guidance into concrete calendar intent I can apply now. Make safe assumptions and keep them explicit. ${goalHint} Only use apply_to_goal when the requested activity clearly matches one of those goals; otherwise use needs_goal and do not repurpose an unrelated goal.`.trim()
    );
  };

  const undoCoachProposal = async () => {
    if (!coachUndoSnapshot) {
      return;
    }
    setCoachPolicyApplying(true);
    try {
      await refreshDraftPreview(coachUndoSnapshot.defaultPolicy);
      if (context?.scopeMonth) {
        setDraftScopeMonth(context.scopeMonth);
      }
      setDraftPolicy(coachUndoSnapshot.defaultPolicy);
      appendCoachContextEvent("Undid latest coach draft proposal");
      setCoachUndoSnapshot(null);
      toast.success("Latest coach draft apply has been undone.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Undo failed.");
    } finally {
      setCoachPolicyApplying(false);
    }
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
        toast.error("Original-date draft markers cannot be moved directly.");
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
      const eligibilityMode = effectivePreview?.eligibilityMode ?? "end_month_v1";
      if (
        eligibilityMode === "end_month_v1" &&
        !normalized.startsWith(`${context.scopeMonth}-`)
      ) {
        toast.error("Draft moves must stay inside the current planner month.");
        return false;
      }
      if (isEntryImmovableForDraft(entry)) {
        toast.error(
          "Completed or historical sessions cannot move in draft. Clear completion in publish mode first."
        );
        return false;
      }
      const baselineUnit = previewUnitByEntryKey.get(entry.key);
      if (!baselineUnit) {
        toast.error("This session is unavailable in the current draft preview.");
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
        toast.error(
          "That date is outside this session's allowed planner window."
        );
        return false;
      }
      if (
        compiledPolicyForDraftMoves &&
        !isDateAllowedByPolicy(
          compiledPolicyForDraftMoves,
          entry.originalGoalId,
          normalized,
          Boolean(baselineUnit.restEligible)
        )
      ) {
        toast.error("That date conflicts with your current planner policy.");
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

      const originalDate = baselineUnit.scheduledDate;
      setDraftScopeMonth(context.scopeMonth);
      if (originalDate === normalized) {
        dispatchDraftCommand({
          type: "remove_kind",
          kind: "move_item",
          goalId: entry.originalGoalId,
          unitKey: entry.unitKey,
        });
      } else {
        dispatchDraftCommand({
          type: "upsert_move",
          goalId: entry.originalGoalId,
          unitKey: entry.unitKey,
          scheduledDate: normalized,
        });
      }
      if (source === "drag_drop") {
        toast.success(
          `Moved ${getEntryDisplayTitle(entry)} to ${normalized} in draft.`
        );
      }
      return true;
    },
    [
      compiledPolicyForDraftMoves,
      completionFactUnitsByGoalDate,
      context?.scopeMonth,
      effectivePreview?.eligibilityMode,
      moveConflictByGoalDate,
      previewUnitByEntryKey,
    ]
  );

  const updateDraftLabel = (entry: PlannerDayDetailEntry, label: string) => {
    if (entry.draftGhost) {
      return;
    }
    const baselineTitle =
      entry.activeGoal?.title ?? context?.goalTitles?.[entry.originalGoalId] ?? null;
    if (context?.scopeMonth) {
      setDraftScopeMonth(context.scopeMonth);
    }
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
      return entry ? getEntryDisplayTitle(entry) : "planner session";
    },
    [entryByKey]
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
      const title = getEntryDisplayTitle(entry);
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
    [entryByKey]
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
      return context?.capabilities.targetedExactCompletion
        ? null
        : "out_of_scope_route";
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

    const nextLocked = !entry.activeItem.locked;
    const mutationKey = `lock:${entry.activeItem.id}`;
    setMutationLoadingKey(mutationKey);
    try {
      const response = await fetch("/api/planner/items/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: entry.activeItem.id,
          locked: nextLocked,
          expectedItemRevision: entry.activeItem.revision,
          expectedCanonicalRevision: context.revisions.canonicalRevision,
          expectedExecutionRevision: context.revisions.executionRevision,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(parseErrorMessage(payload, "Planner lock update failed."));
        return;
      }

      onPlannerMutation();
      const refreshed = await loadContext({
        showLoading: false,
        toastOnError: false,
      });
      if (!refreshed) {
        toast.error(
          "Lock updated, but calendar refresh failed. Please refresh the page."
        );
        return;
      }
      toast.success(nextLocked ? "Planner item locked." : "Planner item unlocked.");
    } catch {
      toast.error("Planner lock update failed.");
    } finally {
      setMutationLoadingKey(null);
    }
  };

  const toggleDateFact = async (
    entry: PlannerDayDetailEntry,
    selectedDateOverride?: string
  ) => {
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
    const mutationKey = `fact:${entry.key}`;

    setMutationLoadingKey(mutationKey);
    try {
      const expectedCreditedUnit =
        desiredFactState === "absent" &&
        entry.activeGoal &&
        entry.activeItem?.credited_completion_date
          ? {
              goalId: entry.activeGoal.original_goal_id,
              requirementFingerprint: entry.activeGoal.requirement_fingerprint,
              unitKey: entry.activeItem.unit_key,
              completedOn: entry.activeItem.credited_completion_date,
            }
          : null;

      const result = await executeCompletionDispatch({
        decision: dispatch.decision,
        desiredFactState,
        goalId: entry.originalGoalId,
        date: selectedDate,
        timezone: context.timezone,
        plannerItemExpectation: entry.activeItem
          ? {
              itemId: entry.activeItem.id,
              expectedItemRevision: entry.activeItem.revision,
              expectedCanonicalRevision: context.revisions.canonicalRevision,
              expectedExecutionRevision: context.revisions.executionRevision,
              expectedCreditedUnit,
            }
          : undefined,
        plannerGoalExpectation: entry.activeGoal
          ? {
              planGoalId: entry.activeGoal.id,
              expectedCanonicalRevision: context.revisions.canonicalRevision,
              expectedExecutionRevision: context.revisions.executionRevision,
            }
          : undefined,
      });

      if (!result.ok) {
        toast.error(result.message ?? "Planner completion update failed.");
        return;
      }

      if (hasDraftSession) {
        const draftPolicyForRefresh =
          effectiveDraftPolicy ?? context.preferences?.defaultPolicy ?? null;
        if (draftPolicyForRefresh) {
          try {
            await refreshDraftPreview(draftPolicyForRefresh);
          } catch {
            toast.error(
              "Completion saved, but draft preview could not refresh automatically."
            );
          }
        }
      }

      onPlannerMutation();
      const refreshed = await loadContext({
        showLoading: false,
        toastOnError: false,
      });
      if (!refreshed) {
        toast.error(
          "Completion updated, but calendar refresh failed. Please refresh the page."
        );
        return;
      }
      toast.success(desiredFactState === "present" ? "Marked done." : "Marked not done.");
    } catch {
      toast.error("Planner completion update failed.");
    } finally {
      setMutationLoadingKey(null);
    }
  };

  const publishPlan = async () => {
    if (!effectivePreview || !context?.capabilities.plannerPlanWrites) {
      return;
    }
    if (!effectivePreview.solver.publishable) {
      toast.error(nonPublishablePreviewMessage(effectivePreview));
      return;
    }
    const idempotencyKey = createClientUuid();
    const confirmationHash = effectivePreview.solver.confirmationRequired
      ? buildPlannerConfirmationHash({
          previewHash: effectivePreview.generationInputHash,
          issueCodes: effectivePreview.solver.issueCodes,
        })
      : null;

    setPublishLoading(true);
    const response = await fetch("/api/planner/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        scopeMonth: context.scopeMonth,
        previewHash: effectivePreview.generationInputHash,
        eligibilityMode: effectivePreview.eligibilityMode,
        expectedCanonicalRevision: context.revisions.canonicalRevision,
        expectedExecutionRevision: context.revisions.executionRevision,
        expectedBasePlanId: context.activePlan?.plan.id ?? null,
        expectedBasePlanVersion: context.activePlan?.plan.version ?? null,
        confirmationHash,
        policy: effectiveDraftPolicy ?? undefined,
        draftCommands: draftPublishCommands,
      }),
    });
    const payload = (await response.json()) as PlannerErrorPayload & {
      replayed?: boolean;
    };
    setPublishLoading(false);
    if (!response.ok) {
      if (payload.code === "planner_not_publishable") {
        const issueCodes = Array.isArray(payload.details?.issueCodes)
          ? payload.details.issueCodes.filter(
              (value): value is string => typeof value === "string"
            )
          : [];
        const detailSuffix =
          issueCodes.length > 0
            ? ` (${issueCodes.join(", ")})`
            : "";
        toast.error(
          `${payload.message ?? "Planner publish is currently blocked."}${detailSuffix}`
        );
        return;
      }
      if (
        payload.code === "validation_failed" &&
        payload.details?.stage === "draft_edits" &&
        payload.details?.code === "draft_item_policy_blocked"
      ) {
        const blockedDate =
          typeof payload.details.scheduledDate === "string"
            ? payload.details.scheduledDate
            : "the selected date";
        toast.error(
          `A draft move lands on ${blockedDate}, which is blocked by your active planner policy (rest days, blackout ranges, or goal weekday rules). Open Planner settings to adjust policy or move the item to an allowed date.`
        );
        return;
      }
      toast.error(payload.message ?? "Planner publish failed.");
      return;
    }
    setDraftScopeMonth(null);
    setDraftPolicy(null);
    setDraftPreview(null);
    dispatchDraftCommand({ type: "clear" });
    onPlannerMutation();
    await loadContext();
    if (context.scopeMonth && context.timezone) {
      sessionStorage.removeItem(
        buildCoachSessionKey(context.scopeMonth, context.timezone)
      );
    }
    resetCoachUiState([]);
    setCoachInput("");
    toast.success(payload.replayed ? "Publish replayed." : "Plan published.");
  };

  const deactivatePlan = async () => {
    if (!context?.activePlan || !context.capabilities.plannerPlanWrites) {
      return;
    }
    setDeactivateLoading(true);
    const response = await fetch("/api/planner/plans/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: context.activePlan.plan.id,
        expectedCanonicalRevision: context.revisions.canonicalRevision,
        expectedExecutionRevision: context.revisions.executionRevision,
      }),
    });
    const payload = (await response.json()) as PlannerErrorPayload;
    setDeactivateLoading(false);
    if (!response.ok) {
      toast.error(payload.message ?? "Planner plan deactivation failed.");
      return;
    }
    setDraftScopeMonth(null);
    setDraftPolicy(null);
    setDraftPreview(null);
    dispatchDraftCommand({ type: "clear" });
    onPlannerMutation();
    await loadContext();
    if (context.scopeMonth && context.timezone) {
      sessionStorage.removeItem(
        buildCoachSessionKey(context.scopeMonth, context.timezone)
      );
    }
    resetCoachUiState([]);
    setCoachInput("");
    toast.success("Plan deactivated.");
  };

  const discardDraftChanges = () => {
    setDraftScopeMonth(null);
    setDraftPolicy(null);
    setDraftPreview(null);
    dispatchDraftCommand({ type: "clear" });
    setCoachUndoSnapshot(null);
    appendCoachContextEvent("Discarded draft changes");
    toast.success("Draft changes reverted to published baseline.");
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
      ? "Monday-first month view. Drag session pills to draft-move them."
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
  const canUseCoach = Boolean(context?.capabilities.coachAi && context?.scopeMonth);
  const hasCoachConversationState =
    coachMessages.length > 0 ||
    coachWarnings.length > 0 ||
    coachRecommendations.length > 0 ||
    coachPendingPatches.length > 0 ||
    coachUnresolvedQuestions.length > 0 ||
    coachContextEvents.length > 0 ||
    coachUndoSnapshot !== null ||
    coachLastProposalMeta !== null ||
    coachInput.trim().length > 0;
  const hasDraftSession =
    effectiveDraftPolicy !== null || Object.keys(effectiveDraftItemEdits).length > 0;
  const draftPublishBlocked = Boolean(
    hasDraftSession &&
      effectivePreview &&
      context?.capabilities.plannerPlanWrites &&
      !effectivePreview.solver.publishable
  );
  const draftPublishBlockedMessage =
    draftPublishBlocked && effectivePreview
      ? nonPublishablePreviewMessage(effectivePreview)
      : null;
  const canMutatePlanItems = Boolean(
    context?.capabilities.plannerPlanWrites &&
      context?.activePlan?.plan.status === "active"
  );
  const publishButtonLabel = publishLoading ? "Publishing..." : "Publish plan";
  const selectedEventCompletionDispatch = selectedEventEntry
    ? getDateFactDispatchForEntry(selectedEventEntry)
    : null;
  const selectedEventCompletionDisabledReason = selectedEventEntry
    ? completionControlDisabledReasonForEntry(
        selectedEventEntry,
        selectedEventCompletionDispatch
      )
    : null;
  const openEntryDetails = (day: string, entryKey: string) => {
    clearHoverPreviewTimer();
    clearHoverPreviewCloseTimer();
    setDayPreview(null);
    setLocalSelectedDay(day);
    setSelectedEventEntryKey(entryKey);
  };
  const renderCalendarDayCell = (cell: { date: string; inMonth: boolean }) => {
    const entriesForDay = orderEntriesForDay(cell.date, getEntriesForDay(cell.date));
    const completionFactMarkersForDay = completionFactMarkersByDate.get(cell.date) ?? [];
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
        getEntryDisplayTitle={getEntryDisplayTitle}
        isEntryCredited={isEntryCredited}
        isEntryImmovableForDraft={isEntryImmovableForDraft}
        onEntryClick={(day, entry) => {
          openEntryDetails(day, entry.key);
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
        <Input
          value={setupTimezone}
          onChange={(event) => setSetupTimezone(event.target.value)}
          placeholder="America/New_York"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Spacing strategy</span>
        <Select
          value={setupSpacing}
          onValueChange={(value: "front_load" | "even" | "flexible") =>
            setSetupSpacing(value)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="front_load">Front load</SelectItem>
            <SelectItem value="even">Even</SelectItem>
            <SelectItem value="flexible">Flexible</SelectItem>
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
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {context?.capabilities.plannerPlanWrites && context.activePlan ? (
                <Button
                  type="button"
                  size="sm"
                  variant={hasDraftSession ? "default" : "destructive"}
                  onClick={hasDraftSession ? publishPlan : deactivatePlan}
                  title={hasDraftSession ? (draftPublishBlockedMessage ?? undefined) : undefined}
                  disabled={
                    loading ||
                    (hasDraftSession
                      ? publishLoading || !effectivePreview || draftPublishBlocked
                      : deactivateLoading)
                  }
                >
                  {hasDraftSession
                    ? publishButtonLabel
                    : deactivateLoading
                      ? "Deactivating..."
                      : "Deactivate Plan"}
                </Button>
              ) : context?.capabilities.plannerPlanWrites &&
                effectivePreview ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={publishPlan}
                  title={
                    effectivePreview && !effectivePreview.solver.publishable
                      ? nonPublishablePreviewMessage(effectivePreview)
                      : undefined
                  }
                  disabled={
                    publishLoading ||
                    loading ||
                    !effectivePreview.solver.publishable
                  }
                >
                  {publishButtonLabel}
                </Button>
              ) : null}
              {hasDraftSession ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={discardDraftChanges}
                  disabled={publishLoading || loading}
                >
                  Undo changes
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
                  <h3 className="truncate text-center text-base font-semibold">
                    {viewHeading}
                  </h3>
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
                  {hasDraftSession ? (
                    <Badge className="border-yellow-300 bg-yellow-100 text-orange-900 dark:border-yellow-300 dark:bg-yellow-100 dark:text-orange-900">
                      Planning Mode
                    </Badge>
                  ) : null}
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
                        getEntryDisplayTitle={getEntryDisplayTitle}
                        getEntrySubtitle={getEntrySubtitle}
                        isEntryCredited={isEntryCredited}
                        isEntryImmovableForDraft={isEntryImmovableForDraft}
                        getCompletionToggleState={(entry, day) => {
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
                          openEntryDetails(focusedDay, entryKey);
                        }}
                        onToggleCompletion={(entry, day) => {
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
                      {monthWeekdayLabels.map((weekday) => (
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
                {draftPublishBlockedMessage ? (
                  <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs">
                    <p className="font-medium">Draft publish is currently blocked.</p>
                    <p className="mt-1 text-muted-foreground">
                      {draftPublishBlockedMessage}
                    </p>
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
                    getEntryDisplayTitle={getEntryDisplayTitle}
                    getEntrySubtitle={getEntrySubtitle}
                    isEntryCredited={isEntryCredited}
                    isEntryImmovableForDraft={isEntryImmovableForDraft}
                    getCompletionToggleState={(entry, day) => {
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
                      openEntryDetails(dayPreview.day, entryKey);
                    }}
                    onToggleCompletion={(entry, day) => {
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
                ) : null}
              </div>
            </PlannerDndProvider>
          </div>

          {canUseCoach ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-base font-semibold">AI Coach</h3>
                <Badge variant="outline">Experimental</Badge>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Ask for habit and training guidance based on your current monthly scope.
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
                {coachMessages.length === 0 ? (
                  <p className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-muted-foreground">
                    Start with a goal question, for example: &quot;Help me build a 4-week running routine.&quot;
                  </p>
                ) : (
                  coachMessages.map((message, index) => (
                    <div
                      key={`${message.createdAt}-${index}`}
                      className={`rounded-md p-2 text-sm ${
                        message.role === "user"
                          ? "bg-primary/10"
                          : "bg-muted"
                      }`}
                    >
                      <p className="mb-1 text-xs uppercase text-muted-foreground">
                        {message.role === "user" ? "You" : "Coach"}
                      </p>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ))
                )}
              </div>
              {coachRecommendations.length > 0 ? (
                <div className="mt-3 rounded-md border border-dashed p-2 text-sm">
                  <p className="mb-1 font-medium">Recommended next actions</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {coachRecommendations.map((recommendation) => (
                      <li key={recommendation}>- {recommendation}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {coachWarnings.length > 0 ? (
                <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs">
                  {coachWarnings.join(" ")}
                </div>
              ) : null}
              {coachPendingPatches.length > 0 ? (
                <div className="mt-3 rounded-md border p-2 text-sm">
                  <p className="font-medium">Coach proposal</p>
                  <p className="text-xs text-muted-foreground">
                    {coachPendingPatches.length} policy patch
                    {coachPendingPatches.length === 1 ? "" : "es"} ready to apply.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {coachPendingPatches.slice(0, 6).map((patch, index) => (
                      <li key={`${patch.kind}-${index}`}>- {patch.kind}</li>
                    ))}
                    {coachPendingPatches.length > 6 ? (
                      <li>...and {coachPendingPatches.length - 6} more</li>
                    ) : null}
                  </ul>
                  {coachUnresolvedQuestions.length > 0 ? (
                    <div className="mt-2 rounded border border-dashed p-2">
                      <p className="text-xs font-medium">Unresolved questions</p>
                      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {coachUnresolvedQuestions.slice(0, 3).map((question) => (
                          <li key={question}>- {question}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void applyCoachProposal()}
                      disabled={coachPolicyApplying}
                    >
                      {coachPolicyApplying ? "Applying..." : "Apply to calendar"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={rejectCoachProposal}
                      disabled={coachPolicyApplying}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : null}
              {coachPendingPatches.length === 0 &&
              coachLastProposalMeta &&
              coachLastProposalMeta.policyPatchCount === 0 &&
              (coachUnresolvedQuestions.length > 0 || coachWarnings.length > 0) ? (
                <div className="mt-3 rounded-md border border-dashed p-2 text-sm">
                  <p className="font-medium">No direct calendar edits returned</p>
                  <p className="text-xs text-muted-foreground">
                    This reply included guidance, but no applicable calendar changes.
                  </p>
                  {coachUnresolvedQuestions.length > 0 ? (
                    <div className="mt-2 rounded border border-dashed p-2">
                      <p className="text-xs font-medium">Coach follow-up questions</p>
                      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {coachUnresolvedQuestions.slice(0, 3).map((question) => (
                          <li key={question}>- {question}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={requestCalendarEditsFromCoach}
                    >
                      Ask coach for apply-able edits
                    </Button>
                  </div>
                </div>
              ) : null}
              {coachUndoSnapshot ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void undoCoachProposal()}
                    disabled={coachPolicyApplying}
                  >
                    {coachPolicyApplying ? "Saving..." : "Undo latest apply"}
                  </Button>
                </div>
              ) : null}
              <div className="mt-3 space-y-2">
                <Textarea
                  value={coachInput}
                  onChange={(event) => setCoachInput(event.target.value)}
                  placeholder="Ask the coach for a specific plan..."
                  rows={4}
                  maxLength={4000}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startNewCoachConversation}
                    disabled={
                      coachLoading || coachPolicyApplying || !hasCoachConversationState
                    }
                  >
                    New conversation
                  </Button>
                  <Button
                    type="button"
                    onClick={sendCoachMessage}
                    disabled={coachLoading || coachInput.trim().length === 0}
                  >
                    {coachLoading ? "Thinking..." : "Send to coach"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

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
                      const displayTitle = getEntryDisplayTitle(entry);
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
                                    ? completionDisabledReasonCopy(
                                        completionDisabledReason
                                      )
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
                    ? getEntryDisplayTitle(selectedEventEntry)
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
                      before your draft move. Edit the moved session on its new date
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
                      <p className="text-[11px] text-muted-foreground">
                        Drag month-cell session pills to move quickly, or use this
                        date field as a keyboard-friendly fallback.
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
