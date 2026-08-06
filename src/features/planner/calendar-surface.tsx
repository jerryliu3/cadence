"use client";

import { addMonths, format, isValid, parse } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { buildMondayFirstMonthCells } from "@/features/planner/month-cells";
import { applyCoachPolicyPatches } from "@/features/planner/coach-policy";
import { buildCoachDeterministicSummary } from "@/features/planner/coach-context";
import { computeDayPreviewPosition } from "@/features/planner/day-preview-popup";
import { getGoalVisual } from "@/features/planner/goal-visuals";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import { resolveCompletionDispatch } from "@/lib/planner/completion-dispatch";
import type { CoachPolicyPatch } from "@/lib/planner/coach";
import { buildPlannerConfirmationHash } from "@/lib/planner/publish-payload";
import { createDefaultPlannerPolicy, plannerPolicySchema, type PlannerPolicy } from "@/lib/planner/policy";

type CalendarTab = "today" | "not-today" | "calendar";

interface PlannerContextPayload {
  schemaVersion: "1";
  scopeMonth: string;
  asOfDate: string;
  timezone: string;
  goalTitles: Record<string, string>;
  preferences: {
    timezone: string;
    timezoneConfirmedAt: string;
    policyRevision: number;
    defaultPolicy: PlannerPolicy;
  } | null;
  capabilities: {
    plannerRead: boolean;
    plannerGeneration: boolean;
    plannerPlanWrites: boolean;
    targetedExactCompletion: boolean;
    coachAi: boolean;
  };
  activePlan: {
    plan: {
      id: string;
      version: number;
      status: "active" | "superseded" | "dismissed";
    };
    goals: PlannerActiveGoalSnapshot[];
    items: PlannerActiveItemSnapshot[];
  } | null;
  preview: {
    generationInputHash: string;
    solver: {
      placementStatus: "complete" | "partial";
      searchStatus:
        | "all_units_placed"
        | "maximum_partial"
        | "blocked_invalid_lock"
        | "soft_optimization_exhausted";
      issueCodes: string[];
      confirmationRequired: boolean;
    };
    workUnits: PlannerWorkUnit[];
  } | null;
  revisions: {
    canonicalRevision: number;
    executionRevision: number;
  };
  staleness: {
    stale: boolean;
    reasons: Array<{ code: string }>;
  };
}

interface PlannerWorkUnit {
  originalGoalId: string;
  unitKey: string;
  label: string | null;
  scheduledDate: string | null;
  classification: string;
  creditState: string;
}

interface PlannerActiveGoalSnapshot {
  id: string;
  goal_id: string | null;
  original_goal_id: string;
  requirement_fingerprint: string;
  title: string;
  category: string;
  color: string | null;
}

interface PlannerActiveItemSnapshot {
  id: string;
  plan_goal_id: string;
  unit_key: string;
  requirement_kind: "milestone_sequence" | "cadence" | "deadline_total";
  scheduled_date: string | null;
  classification: string;
  credit_state: string;
  locked: boolean;
  revision: number;
  credited_completion_id: string | null;
  credited_completion_date: string | null;
}

interface PlannerDayDetailEntry {
  key: string;
  originalGoalId: string;
  goalTitle: string | null;
  unitKey: string;
  label: string | null;
  classification: string;
  creditState: string;
  activeGoal: PlannerActiveGoalSnapshot | null;
  activeItem: PlannerActiveItemSnapshot | null;
}

interface DayPreviewState {
  day: string;
  pinned: boolean;
  position: {
    top: number;
    left: number;
    width: number;
    placement: "above" | "below";
  };
}

interface PlannerErrorPayload {
  code?: string;
  message?: string;
}

interface DraftItemEdit {
  scheduledDate?: string | null;
  label?: string | null;
}

interface PlannerPreviewResponsePayload {
  preview: PlannerContextPayload["preview"];
}

interface PlannerPreferencesPayload {
  schemaVersion: "1";
  preferences: {
    timezone: string;
    timezoneConfirmedAt: string;
    policyRevision: number;
    defaultPolicy: PlannerPolicy;
  } | null;
}

interface CalendarSurfaceProps {
  activeTab: CalendarTab;
  month: string | null;
  selectedDay: string | null;
  onMonthChange: (month: string, mode: "push" | "replace") => void;
  onCloseDay: () => void;
  onPlannerMutation: () => void;
}

const monthWeekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const restWeekdayOptions: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];
const COACH_SESSION_MAX_MESSAGES = 20;
const COACH_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const DAY_PREVIEW_HOVER_DELAY_MS = 500;
const DAY_PREVIEW_LONG_PRESS_DELAY_MS = 500;

type CoachMessageRole = "user" | "assistant";

interface CoachMessage {
  role: CoachMessageRole;
  content: string;
  createdAt: number;
}

interface CoachResponsePayload {
  schemaVersion: "1";
  phase: "discovery" | "review" | "ready" | "explain";
  reply: string;
  proposal?: {
    policyPatches?: CoachPolicyPatch[];
    unresolvedQuestions?: string[];
  };
  warnings?: string[];
  recommendations?: Array<{ text: string }>;
}

interface CoachLastProposalMeta {
  policyPatchCount: number;
}

function parseMonth(month: string) {
  return parse(`${month}-01`, "yyyy-MM-dd", new Date());
}

function getMonthInTimezone(timezone: string) {
  return getDateInTimezone(new Date(), timezone).slice(0, 7);
}

function splitEntryKey(entryKey: string) {
  const separatorIndex = entryKey.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === entryKey.length - 1) {
    return null;
  }
  return {
    goalId: entryKey.slice(0, separatorIndex),
    unitKey: entryKey.slice(separatorIndex + 1),
  };
}

function isDerivedCounterLabel(value: string | null) {
  if (!value) {
    return false;
  }
  return /^total:\d+$/i.test(value.trim());
}

function getEntryDisplayTitle(entry: Pick<PlannerDayDetailEntry, "goalTitle" | "label" | "unitKey">) {
  if (entry.goalTitle) {
    return entry.goalTitle;
  }
  if (entry.label && !isDerivedCounterLabel(entry.label)) {
    return entry.label;
  }
  return entry.unitKey;
}

function getEntrySubtitle(entry: Pick<PlannerDayDetailEntry, "goalTitle" | "label">) {
  if (!entry.label || isDerivedCounterLabel(entry.label)) {
    return null;
  }
  if (entry.goalTitle && entry.label === entry.goalTitle) {
    return null;
  }
  return entry.label;
}

function monthToLabel(month: string) {
  return format(parseMonth(month), "MMMM yyyy");
}

function getDayStatus(
  itemsForDay: Array<{ classification: string; creditState: string }>,
  fallback: string
) {
  if (!itemsForDay || itemsForDay.length === 0) {
    return fallback;
  }
  if (itemsForDay.some((item) => item.classification.startsWith("historical"))) {
    return "Historical";
  }
  if (itemsForDay.some((item) => item.creditState !== "uncredited")) {
    return "Completed";
  }
  return "Planned";
}

function createClientUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function buildCoachSessionKey(scopeMonth: string, timezone: string) {
  return `planner-coach-session:v1:${scopeMonth}:${timezone}`;
}

function loadCoachSession(scopeMonth: string, timezone: string): CoachMessage[] {
  try {
    const raw = sessionStorage.getItem(buildCoachSessionKey(scopeMonth, timezone));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as
      | { expiresAt: number; messages: CoachMessage[] }
      | null;
    if (!parsed || parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(buildCoachSessionKey(scopeMonth, timezone));
      return [];
    }
    return parsed.messages.slice(-COACH_SESSION_MAX_MESSAGES);
  } catch {
    return [];
  }
}

function saveCoachSession(
  scopeMonth: string,
  timezone: string,
  messages: CoachMessage[]
) {
  try {
    const payload = {
      expiresAt: Date.now() + COACH_SESSION_TTL_MS,
      messages: messages.slice(-COACH_SESSION_MAX_MESSAGES),
    };
    sessionStorage.setItem(
      buildCoachSessionKey(scopeMonth, timezone),
      JSON.stringify(payload)
    );
  } catch {
    // Ignore storage failures (private mode/quota) and keep in-memory state.
  }
}

export function CalendarSurface({
  activeTab,
  month,
  selectedDay,
  onMonthChange,
  onCloseDay,
  onPlannerMutation,
}: CalendarSurfaceProps) {
  const [context, setContext] = useState<PlannerContextPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [dismissLoading, setDismissLoading] = useState(false);
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
  const [draftItemEdits, setDraftItemEdits] = useState<Record<string, DraftItemEdit>>(
    {}
  );
  const [coachContextEvents, setCoachContextEvents] = useState<string[]>([]);
  const [selectedEventEntryKey, setSelectedEventEntryKey] = useState<string | null>(
    null
  );
  const [dayPreview, setDayPreview] = useState<DayPreviewState | null>(null);
  const [localSelectedDay, setLocalSelectedDay] = useState<string | null>(null);
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
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
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

  const loadContext = useCallback(async () => {
    if (activeTab !== "calendar") {
      return;
    }

    setError(null);
    if (!month) {
      setLoading(true);
      const response = await fetch("/api/planner/preferences", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json();
      setLoading(false);
      if (!response.ok) {
        const errorPayload = payload as PlannerErrorPayload;
        setError(errorPayload.message ?? "Planner setup could not be loaded.");
        return;
      }
      const preferencesPayload = payload as PlannerPreferencesPayload;
      if (preferencesPayload.preferences?.timezone) {
        const resolvedMonth = getMonthInTimezone(
          preferencesPayload.preferences.timezone
        );
        onMonthChange(resolvedMonth, "replace");
        return;
      }
      return;
    }

    setLoading(true);
    const query = new URLSearchParams({ scopeMonth: month });
    const response = await fetch(`/api/planner/context?${query.toString()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      const errorPayload = payload as PlannerErrorPayload;
      setContext(null);
      setError(
        errorPayload.message ?? "Planner calendar context could not be loaded."
      );
      return;
    }

    const contextPayload = payload as PlannerContextPayload;
    setContext(contextPayload);
    if (contextPayload.preferences?.timezone) {
      setSetupTimezone(contextPayload.preferences.timezone);
      setSetupSpacing(contextPayload.preferences.defaultPolicy.spacingStrategy);
      setSetupRestWeekdays(contextPayload.preferences.defaultPolicy.restWeekdays);
    }
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
  const currentScopeMonth = context?.scopeMonth ?? month;
  const draftMatchesCurrentScope =
    Boolean(currentScopeMonth) && draftScopeMonth === currentScopeMonth;
  const effectiveDraftPolicy = draftMatchesCurrentScope ? draftPolicy : null;
  const effectiveDraftPreview = draftMatchesCurrentScope ? draftPreview : null;
  const effectiveDraftItemEdits = useMemo(
    () => (draftMatchesCurrentScope ? draftItemEdits : {}),
    [draftMatchesCurrentScope, draftItemEdits]
  );
  const effectivePreview = effectiveDraftPreview ?? context?.preview ?? null;
  const activeGoalsByPlanGoalId = useMemo(() => {
    const map = new Map<string, PlannerActiveGoalSnapshot>();
    for (const goal of context?.activePlan?.goals ?? []) {
      map.set(goal.id, goal);
    }
    return map;
  }, [context?.activePlan?.goals]);

  const activeGoalsByOriginalGoalId = useMemo(() => {
    const map = new Map<string, PlannerActiveGoalSnapshot>();
    for (const goal of context?.activePlan?.goals ?? []) {
      map.set(goal.original_goal_id, goal);
    }
    return map;
  }, [context?.activePlan?.goals]);

  const entriesByDate = useMemo(() => {
    const byDate = new Map<string, Map<string, PlannerDayDetailEntry>>();
    const entryByKey = new Map<string, PlannerDayDetailEntry>();
    const entryDayByKey = new Map<string, string>();
    const setEntryOnDay = (
      day: string,
      key: string,
      entry: PlannerDayDetailEntry
    ) => {
      const existingDay = entryDayByKey.get(key);
      if (existingDay && existingDay !== day) {
        byDate.get(existingDay)?.delete(key);
      }
      const existing = byDate.get(day);
      if (existing) {
        existing.set(key, entry);
      } else {
        const created = new Map<string, PlannerDayDetailEntry>();
        created.set(key, entry);
        byDate.set(day, created);
      }
      entryByKey.set(key, entry);
      entryDayByKey.set(key, day);
    };

    for (const unit of effectivePreview?.workUnits ?? []) {
      if (!unit.scheduledDate) {
        continue;
      }
      const key = `${unit.originalGoalId}:${unit.unitKey}`;
      setEntryOnDay(unit.scheduledDate, key, {
        key,
        originalGoalId: unit.originalGoalId,
        goalTitle:
          activeGoalsByOriginalGoalId.get(unit.originalGoalId)?.title ??
          context?.goalTitles?.[unit.originalGoalId] ??
          null,
        unitKey: unit.unitKey,
        label: unit.label,
        classification: unit.classification,
        creditState: unit.creditState,
        activeGoal: activeGoalsByOriginalGoalId.get(unit.originalGoalId) ?? null,
        activeItem: null,
      });
    }

    for (const item of context?.activePlan?.items ?? []) {
      const activeGoal = activeGoalsByPlanGoalId.get(item.plan_goal_id) ?? null;
      const originalGoalId = activeGoal?.original_goal_id ?? item.plan_goal_id;
      const key = `${originalGoalId}:${item.unit_key}`;
      const existingEntry = entryByKey.get(key);
      if (existingEntry) {
        const existingDay = entryDayByKey.get(key);
        if (!existingDay) {
          continue;
        }
        setEntryOnDay(existingDay, key, {
          ...existingEntry,
          goalTitle:
            existingEntry.goalTitle ??
            activeGoal?.title ??
            context?.goalTitles?.[originalGoalId] ??
            null,
          activeGoal: existingEntry.activeGoal ?? activeGoal,
          activeItem: item,
        });
        continue;
      }
      if (!item.scheduled_date) {
        continue;
      }
      setEntryOnDay(item.scheduled_date, key, {
        key,
        originalGoalId,
        goalTitle: activeGoal?.title ?? context?.goalTitles?.[originalGoalId] ?? null,
        unitKey: item.unit_key,
        label: activeGoal?.title ?? item.unit_key,
        classification: item.classification,
        creditState: item.credit_state,
        activeGoal,
        activeItem: item,
      });
    }

    for (const [key, edit] of Object.entries(effectiveDraftItemEdits)) {
      const existingEntry = entryByKey.get(key);
      if (!existingEntry) {
        continue;
      }
      const currentDay = entryDayByKey.get(key) ?? null;
      const nextDay =
        edit.scheduledDate === undefined ? currentDay : edit.scheduledDate;
      const nextGoalTitle =
        edit.label === undefined
          ? existingEntry.goalTitle
          : edit.label ?? existingEntry.goalTitle;

      if (currentDay) {
        byDate.get(currentDay)?.delete(key);
      }
      if (!nextDay) {
        entryByKey.delete(key);
        entryDayByKey.delete(key);
        continue;
      }

      setEntryOnDay(nextDay, key, {
        ...existingEntry,
        goalTitle: nextGoalTitle,
        activeItem: existingEntry.activeItem
          ? {
              ...existingEntry.activeItem,
              scheduled_date: nextDay,
            }
          : null,
      });
    }

    return new Map(
      Array.from(byDate.entries()).map(([day, dayEntries]) => [
        day,
        Array.from(dayEntries.values()),
      ])
    );
  }, [
    activeGoalsByOriginalGoalId,
    activeGoalsByPlanGoalId,
    context?.goalTitles,
    context?.activePlan?.items,
    effectiveDraftItemEdits,
    effectivePreview?.workUnits,
  ]);
  const effectiveSelectedDay = selectedDay ?? localSelectedDay;

  const getEntriesForDay = useCallback(
    (day: string | null) => (day ? entriesByDate.get(day) ?? [] : []),
    [entriesByDate]
  );

  const selectedDayEntries = useMemo(() => {
    return getEntriesForDay(effectiveSelectedDay);
  }, [effectiveSelectedDay, getEntriesForDay]);
  const coachSummaryWorkUnits = useMemo(() => {
    const units: PlannerWorkUnit[] = [];
    for (const [day, entries] of entriesByDate.entries()) {
      for (const entry of entries) {
        units.push({
          originalGoalId: entry.originalGoalId,
          unitKey: entry.unitKey,
          label: entry.label,
          scheduledDate: day,
          classification: entry.classification,
          creditState: entry.creditState,
        });
      }
    }
    return units;
  }, [entriesByDate]);

  const selectedEventEntry = useMemo(
    () =>
      selectedEventEntryKey
        ? selectedDayEntries.find((entry) => entry.key === selectedEventEntryKey) ?? null
        : null,
    [selectedDayEntries, selectedEventEntryKey]
  );
  const selectedEventDraftEdit = selectedEventEntry
    ? effectiveDraftItemEdits[selectedEventEntry.key]
    : undefined;

  const previewDayEntries = useMemo(
    () => getEntriesForDay(dayPreview?.day ?? null),
    [dayPreview?.day, getEntriesForDay]
  );

  useEffect(
    () => () => {
      if (hoverPreviewTimerRef.current) {
        window.clearTimeout(hoverPreviewTimerRef.current);
      }
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    []
  );

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
    setDraftItemEdits({});
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

  const draftPublishEdits = useMemo(() => {
    return Object.entries(effectiveDraftItemEdits)
      .map(([entryKey, edit]) => {
        const parsed = splitEntryKey(entryKey);
        if (!parsed) {
          return null;
        }
        return {
          goalId: parsed.goalId,
          unitKey: parsed.unitKey,
          scheduledDate:
            edit.scheduledDate === undefined ? null : edit.scheduledDate,
          label: edit.label === undefined ? null : edit.label,
        };
      })
      .filter(
        (
          value
        ): value is {
          goalId: string;
          unitKey: string;
          scheduledDate: string | null;
          label: string | null;
        } => value !== null
      );
  }, [effectiveDraftItemEdits]);

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
    if (dayPreview?.pinned) {
      return;
    }
    clearHoverPreviewTimer();
    hoverPreviewTimerRef.current = window.setTimeout(() => {
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
        setCoachPendingPatches([]);
        setCoachUnresolvedQuestions([]);
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
      await refreshDraftPreview(result.policy);
      setDraftScopeMonth(context.scopeMonth);
      setDraftPolicy(result.policy);
      setCoachUndoSnapshot({
        timezone: context.preferences.timezone,
        defaultPolicy: priorPolicy,
      });
      setCoachPendingPatches([]);
      setCoachUnresolvedQuestions([]);
      appendCoachContextEvent(
        `Applied coach proposal to draft (${result.appliedPatchCount} patches)`
      );
      toast.success("Coach proposal applied to draft preview.");
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

  const updateDraftLabel = (entry: PlannerDayDetailEntry, label: string) => {
    const normalized = label.trim();
    if (context?.scopeMonth) {
      setDraftScopeMonth(context.scopeMonth);
    }
    setDraftItemEdits((previous) => ({
      ...previous,
      [entry.key]: {
        ...(previous[entry.key] ?? {}),
        label: normalized.length > 0 ? normalized : null,
      },
    }));
  };

  const updateDraftScheduledDate = (entry: PlannerDayDetailEntry, date: string) => {
    const normalized = date.trim();
    if (!normalized || !isValidIsoDate(normalized)) {
      return;
    }
    if (context?.scopeMonth) {
      setDraftScopeMonth(context.scopeMonth);
    }
    setDraftItemEdits((previous) => ({
      ...previous,
      [entry.key]: {
        ...(previous[entry.key] ?? {}),
        scheduledDate: normalized,
      },
    }));
  };

  const getDateFactDispatchForEntry = (entry: PlannerDayDetailEntry) => {
    if (!context || !effectiveSelectedDay) {
      return null;
    }

    const requirementKind =
      entry.activeItem?.requirement_kind ??
      (entry.unitKey.startsWith("milestone:")
        ? "milestone_sequence"
        : entry.unitKey.startsWith("cadence:")
          ? "cadence"
          : "deadline_total");
    const targetedRecurring = requirementKind === "deadline_total";
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
      effectiveSelectedDay < context.asOfDate
        ? "past"
        : effectiveSelectedDay > context.asOfDate
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
      await loadContext();
      toast.success(nextLocked ? "Planner item locked." : "Planner item unlocked.");
    } catch {
      toast.error("Planner lock update failed.");
    } finally {
      setMutationLoadingKey(null);
    }
  };

  const toggleDateFact = async (entry: PlannerDayDetailEntry) => {
    if (
      !context ||
      !effectiveSelectedDay ||
      !context.capabilities.targetedExactCompletion
    ) {
      return;
    }
    const dispatch = getDateFactDispatchForEntry(entry);
    if (!dispatch) {
      toast.error("This planner item cannot be updated from the current snapshot.");
      return;
    }
    if (!dispatch.decision.allowed) {
      const message =
        dispatch.decision.reason === "satisfied_elsewhere"
          ? "This session is already satisfied by a completion elsewhere."
          : dispatch.decision.reason === "future_creation"
            ? "You can only mark planner sessions done for today or past dates."
            : "This planner item cannot be updated from the current snapshot.";
      toast.error(message);
      return;
    }

    const desiredFactState = dispatch.desiredFactState;
    const mutationKey = `fact:${entry.key}`;

    setMutationLoadingKey(mutationKey);
    try {
      let response: Response | null = null;
      if (dispatch.decision.route === "item_date" && entry.activeItem) {
        const expectedCreditedUnit =
          desiredFactState === "absent" &&
          entry.activeGoal &&
          entry.activeItem.credited_completion_date
            ? {
                goalId: entry.activeGoal.original_goal_id,
                requirementFingerprint: entry.activeGoal.requirement_fingerprint,
                unitKey: entry.activeItem.unit_key,
                completedOn: entry.activeItem.credited_completion_date,
              }
            : null;

        if (desiredFactState === "present" || expectedCreditedUnit) {
          response = await fetch("/api/planner/items/date-fact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: entry.activeItem.id,
              desiredFactState,
              expectedCreditedUnit,
              expectedItemRevision: entry.activeItem.revision,
              expectedCanonicalRevision: context.revisions.canonicalRevision,
              expectedExecutionRevision: context.revisions.executionRevision,
            }),
          });
        }
      }

      if (
        !response &&
        dispatch.decision.route === "plan_goal_date" &&
        entry.activeGoal
      ) {
        response = await fetch("/api/planner/goals/date-fact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planGoalId: entry.activeGoal.id,
            date: effectiveSelectedDay,
            desiredFactState,
            expectedCanonicalRevision: context.revisions.canonicalRevision,
            expectedExecutionRevision: context.revisions.executionRevision,
          }),
        });
      }

      if (!response) {
        toast.error("This planner item cannot be updated from the current snapshot.");
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(parseErrorMessage(payload, "Planner completion update failed."));
        return;
      }

      onPlannerMutation();
      await loadContext();
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
        expectedCanonicalRevision: context.revisions.canonicalRevision,
        expectedExecutionRevision: context.revisions.executionRevision,
        expectedBasePlanId: context.activePlan?.plan.id ?? null,
        expectedBasePlanVersion: context.activePlan?.plan.version ?? null,
        confirmationHash,
        policy: effectiveDraftPolicy ?? undefined,
        draftItemEdits: draftPublishEdits,
      }),
    });
    const payload = (await response.json()) as PlannerErrorPayload & {
      replayed?: boolean;
    };
    setPublishLoading(false);
    if (!response.ok) {
      toast.error(payload.message ?? "Planner publish failed.");
      return;
    }
    setDraftScopeMonth(null);
    setDraftPolicy(null);
    setDraftPreview(null);
    setDraftItemEdits({});
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

  const dismissPlan = async () => {
    if (!context?.activePlan || !context.capabilities.plannerPlanWrites) {
      return;
    }
    setDismissLoading(true);
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
    setDismissLoading(false);
    if (!response.ok) {
      toast.error(payload.message ?? "Planner plan dismiss failed.");
      return;
    }
    setDraftScopeMonth(null);
    setDraftPolicy(null);
    setDraftPreview(null);
    setDraftItemEdits({});
    onPlannerMutation();
    await loadContext();
    if (context.scopeMonth && context.timezone) {
      sessionStorage.removeItem(
        buildCoachSessionKey(context.scopeMonth, context.timezone)
      );
    }
    resetCoachUiState([]);
    setCoachInput("");
    toast.success("Plan dismissed.");
  };

  const discardDraftChanges = () => {
    setDraftScopeMonth(null);
    setDraftPolicy(null);
    setDraftPreview(null);
    setDraftItemEdits({});
    setCoachUndoSnapshot(null);
    appendCoachContextEvent("Discarded draft changes");
    toast.success("Draft changes reverted to published baseline.");
  };

  const plannerSearchStatus = effectivePreview?.solver.searchStatus;
  const monthStatusLabel =
    plannerSearchStatus === "all_units_placed"
      ? "Complete"
      : plannerSearchStatus === "maximum_partial"
        ? "Partial"
        : plannerSearchStatus === "blocked_invalid_lock"
          ? "Blocked"
          : plannerSearchStatus === "soft_optimization_exhausted"
            ? "Soft optimization exhausted"
            : "Unplanned";

  const canShowSetup = !context?.preferences;
  const monthLabel = month ? monthToLabel(month) : "Calendar";
  const todayMonth = context?.timezone
    ? getMonthInTimezone(context.timezone)
    : getMonthInTimezone(setupTimezone);
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
  const canMutatePlanItems = Boolean(
    context?.capabilities.plannerPlanWrites &&
      context?.activePlan?.plan.status === "active"
  );
  const calendarToday =
    context?.asOfDate ??
    getDateInTimezone(new Date(), context?.timezone ?? setupTimezone);
  const selectedEventCompletionDispatch = selectedEventEntry
    ? getDateFactDispatchForEntry(selectedEventEntry)
    : null;

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <h2 className="text-lg font-semibold">Calendar</h2>
              <Badge variant="secondary">{monthStatusLabel}</Badge>
              {context?.staleness.stale ? (
                <Badge variant="outline">Stale</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!month || loading}
              onClick={() =>
                month
                  ? onMonthChange(
                      format(addMonths(parseMonth(month), -1), "yyyy-MM"),
                      "push"
                    )
                  : undefined
              }
            >
              <ChevronLeft className="size-4" />
              Previous month
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => onMonthChange(todayMonth, "push")}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!month || loading}
              onClick={() =>
                month
                  ? onMonthChange(
                      format(addMonths(parseMonth(month), 1), "yyyy-MM"),
                      "push"
                    )
                  : undefined
              }
            >
              Next month
              <ChevronRight className="size-4" />
            </Button>
            {context?.preferences ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                disabled={loading}
              >
                <Settings2 className="mr-1 size-4" />
                Settings
              </Button>
            ) : null}
            {context?.capabilities.plannerPlanWrites &&
            effectivePreview ? (
              <Button
                type="button"
                size="sm"
                onClick={publishPlan}
                disabled={publishLoading || loading}
              >
                {publishLoading
                  ? "Publishing..."
                  : hasDraftSession
                    ? context.activePlan
                      ? "Publish draft update"
                      : "Publish draft plan"
                    : context.activePlan
                      ? "Update Plan"
                      : "Publish Plan"}
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
                Undo draft
              </Button>
            ) : null}
            {context?.capabilities.plannerPlanWrites &&
            context.activePlan ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={dismissPlan}
                disabled={dismissLoading || loading}
              >
                {dismissLoading ? "Dismissing..." : "Dismiss Plan"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? (
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
            <Settings2 className="size-4 text-primary" />
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
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{monthLabel}</h3>
                {hasDraftSession ? (
                  <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    Planning Mode
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Monday-first month view
              </p>
            </div>
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
              {monthWeekdayLabels.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2" data-no-swipe="true">
              {cells.map((cell) => {
                const entriesForDay = getEntriesForDay(cell.date);
                const status = getDayStatus(entriesForDay, "No items");
                const isToday = cell.date === calendarToday;
                const isPastInMonth = cell.inMonth && cell.date < calendarToday;
                const ariaLabel = `${format(
                  parse(cell.date, "yyyy-MM-dd", new Date()),
                  "EEEE, MMMM d, yyyy"
                )}. ${entriesForDay.length} planned item${
                  entriesForDay.length === 1 ? "" : "s"
                }. ${status}.`;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={(event) =>
                      handleDayCellClick(cell.date, event.currentTarget)
                    }
                    onMouseEnter={(event) =>
                      scheduleHoverPreview(cell.date, event.currentTarget)
                    }
                    onMouseLeave={() => {
                      clearHoverPreviewTimer();
                      if (dayPreview?.day === cell.date && !dayPreview.pinned) {
                        setDayPreview(null);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType === "touch") {
                        startLongPressPreview(cell.date, event.currentTarget);
                      }
                    }}
                    onPointerUp={() => {
                      clearLongPressTimer();
                    }}
                    onPointerCancel={() => {
                      clearLongPressTimer();
                    }}
                    onPointerLeave={() => {
                      clearLongPressTimer();
                    }}
                    className={`min-h-24 rounded-lg border p-2 text-left transition-colors ${
                      cell.inMonth
                        ? isToday
                          ? "bg-primary/10 ring-1 ring-primary/50 hover:border-primary"
                          : isPastInMonth
                            ? "bg-muted/20 hover:border-primary/50"
                            : "bg-background hover:border-primary/60"
                        : "bg-muted/30 text-muted-foreground"
                    }`}
                    aria-label={ariaLabel}
                    data-no-swipe="true"
                    data-day-cell="true"
                    data-day={cell.date}
                  >
                    <p
                      className={`text-xs font-medium ${
                        isToday ? "text-primary" : ""
                      }`}
                    >
                      {cell.date.slice(8, 10)}
                    </p>
                    {entriesForDay.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {entriesForDay.slice(0, 2).map((entry) => {
                          const visual = getGoalVisual({
                            goalId: entry.originalGoalId,
                            color: entry.activeGoal?.color ?? null,
                          });
                          const Icon = visual.Icon;
                          const compactTitle = getEntryDisplayTitle(entry);
                          return (
                            <div
                              key={`cell-entry-${entry.key}`}
                              className="flex items-center gap-1 text-[10px]"
                            >
                              <span
                                className="inline-flex size-3 items-center justify-center rounded-full"
                                style={{ backgroundColor: visual.color }}
                              >
                                <Icon className="size-2 text-white" />
                              </span>
                              <span className="truncate">
                                {compactTitle}
                              </span>
                            </div>
                          );
                        })}
                        {entriesForDay.length > 2 ? (
                          <p className="text-[10px] text-muted-foreground">
                            +{entriesForDay.length - 2} more
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {dayPreview ? (
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
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {format(parse(dayPreview.day, "yyyy-MM-dd", new Date()), "EEEE, MMM d")}
                </p>
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
              <div className="max-h-44 space-y-1 overflow-y-auto text-xs">
                {previewDayEntries.length === 0 ? (
                  <p className="text-muted-foreground">No planned sessions.</p>
                ) : (
                  previewDayEntries.map((entry) => {
                    const visual = getGoalVisual({
                      goalId: entry.originalGoalId,
                      color: entry.activeGoal?.color ?? null,
                    });
                    const Icon = visual.Icon;
                    const displayTitle = getEntryDisplayTitle(entry);
                    const subtitle = getEntrySubtitle(entry);
                    return (
                      <button
                        key={`preview-entry-${entry.key}`}
                        type="button"
                        className="flex w-full items-start gap-2 rounded border p-1.5 text-left transition-colors hover:border-primary/60"
                        onClick={() => {
                          setLocalSelectedDay(dayPreview.day);
                          setSelectedEventEntryKey(entry.key);
                          setDayPreview(null);
                        }}
                      >
                        <span
                          className="mt-0.5 inline-flex size-4 items-center justify-center rounded-full"
                          style={{ backgroundColor: visual.color }}
                        >
                          <Icon className="size-2.5 text-white" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {displayTitle}
                          </p>
                          {subtitle ? (
                            <p className="truncate text-muted-foreground">
                              {subtitle}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {canUseCoach ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-semibold">AI Coach</h3>
                <Badge variant="outline">Experimental</Badge>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Ask for habit and training guidance based on your current monthly scope.
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
                {coachMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
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
            open={Boolean(selectedDay)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedEventEntryKey(null);
                setLocalSelectedDay(null);
                onCloseDay();
              }
            }}
          >
            <DialogContent
              className="top-auto bottom-0 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl"
              aria-describedby="planner-day-detail-description"
            >
              <DialogHeader>
                <DialogTitle>
                  {selectedDay
                    ? format(
                        parse(selectedDay, "yyyy-MM-dd", new Date()),
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
                      return (
                        <li key={entry.key}>
                          <button
                            type="button"
                            className="w-full rounded-lg border p-2 text-left text-sm transition-colors hover:border-primary/60"
                            onClick={() => setSelectedEventEntryKey(entry.key)}
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
                            <p className="mt-1 text-xs text-primary">
                              View event details
                            </p>
                          </button>
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
                if (!selectedDay) {
                  setLocalSelectedDay(null);
                }
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
                  {getEntrySubtitle(selectedEventEntry) ? (
                    <p className="text-xs text-muted-foreground">
                      {getEntrySubtitle(selectedEventEntry)}
                    </p>
                  ) : null}
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
                          onClick={() => void toggleDateFact(selectedEventEntry)}
                          disabled={
                            Boolean(mutationLoadingKey) ||
                            !canMutatePlanItems ||
                            !context?.capabilities.targetedExactCompletion ||
                            !selectedEventCompletionDispatch?.decision.allowed
                          }
                        >
                          {mutationLoadingKey === `fact:${selectedEventEntry.key}`
                            ? "Saving..."
                            : selectedEventCompletionDispatch?.currentlyCredited
                              ? "Undo done"
                              : "Mark done"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
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
