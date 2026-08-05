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
import type { CoachPolicyPatch } from "@/lib/planner/coach";
import { buildPlannerConfirmationHash } from "@/lib/planner/publish-payload";
import { createDefaultPlannerPolicy, plannerPolicySchema, type PlannerPolicy } from "@/lib/planner/policy";

type CalendarTab = "today" | "not-today" | "calendar";

interface PlannerContextPayload {
  schemaVersion: "1";
  scopeMonth: string;
  asOfDate: string;
  timezone: string;
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
  unitKey: string;
  label: string | null;
  classification: string;
  creditState: string;
  activeGoal: PlannerActiveGoalSnapshot | null;
  activeItem: PlannerActiveItemSnapshot | null;
}

interface DayPreviewState {
  day: string;
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
  onOpenDay: (day: string) => void;
  onCloseDay: () => void;
  onPlannerMutation: () => void;
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COACH_SESSION_MAX_MESSAGES = 20;
const COACH_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

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
    assessments?: Array<Record<string, unknown>>;
    policyPatches?: CoachPolicyPatch[];
    unresolvedQuestions?: string[];
  };
  warnings?: string[];
  recommendations?: Array<{ text: string }>;
}

function parseMonth(month: string) {
  return parse(`${month}-01`, "yyyy-MM-dd", new Date());
}

function getMonthInTimezone(timezone: string) {
  return getDateInTimezone(new Date(), timezone).slice(0, 7);
}

function monthToLabel(month: string) {
  return format(parseMonth(month), "MMMM yyyy");
}

function getDayStatus(unitsForDay: PlannerWorkUnit[], fallback: string) {
  if (!unitsForDay || unitsForDay.length === 0) {
    return fallback;
  }
  if (unitsForDay.some((unit) => unit.classification.startsWith("historical"))) {
    return "Historical";
  }
  if (unitsForDay.some((unit) => unit.creditState !== "uncredited")) {
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
  onOpenDay,
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
  const [coachContextEvents, setCoachContextEvents] = useState<string[]>([]);
  const [selectedEventEntryKey, setSelectedEventEntryKey] = useState<string | null>(
    null
  );
  const [dayPreview, setDayPreview] = useState<DayPreviewState | null>(null);
  const [mutationLoadingKey, setMutationLoadingKey] = useState<string | null>(null);
  const [moveDateByItemId, setMoveDateByItemId] = useState<Record<string, string>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [setupTimezone, setSetupTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [setupSpacing, setSetupSpacing] = useState<"front_load" | "even" | "flexible">(
    "even"
  );
  const [setupRestWeekdays, setSetupRestWeekdays] = useState<number[]>([]);
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

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
      setCoachMessages(restored);
      setCoachWarnings([]);
      setCoachRecommendations([]);
      setCoachPendingPatches([]);
      setCoachUnresolvedQuestions([]);
      setCoachContextEvents([]);
      setCoachUndoSnapshot(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, context?.scopeMonth, context?.timezone]);

  const cells = useMemo(
    () => (month ? buildMondayFirstMonthCells(month) : []),
    [month]
  );
  const unitsByDate = useMemo(() => {
    const map = new Map<string, PlannerWorkUnit[]>();
    const units = context?.preview?.workUnits ?? [];
    for (const unit of units) {
      if (!unit.scheduledDate) {
        continue;
      }
      const existing = map.get(unit.scheduledDate) ?? [];
      existing.push(unit);
      map.set(unit.scheduledDate, existing);
    }
    return map;
  }, [context?.preview?.workUnits]);
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
    const getDayEntries = (day: string) => {
      const existing = byDate.get(day);
      if (existing) {
        return existing;
      }
      const created = new Map<string, PlannerDayDetailEntry>();
      byDate.set(day, created);
      return created;
    };

    for (const unit of context?.preview?.workUnits ?? []) {
      if (!unit.scheduledDate) {
        continue;
      }
      const dayEntries = getDayEntries(unit.scheduledDate);
      const key = `${unit.originalGoalId}:${unit.unitKey}`;
      dayEntries.set(key, {
        key,
        originalGoalId: unit.originalGoalId,
        unitKey: unit.unitKey,
        label: unit.label,
        classification: unit.classification,
        creditState: unit.creditState,
        activeGoal: activeGoalsByOriginalGoalId.get(unit.originalGoalId) ?? null,
        activeItem: null,
      });
    }

    for (const item of context?.activePlan?.items ?? []) {
      if (!item.scheduled_date) {
        continue;
      }
      const dayEntries = getDayEntries(item.scheduled_date);
      const activeGoal = activeGoalsByPlanGoalId.get(item.plan_goal_id) ?? null;
      const originalGoalId = activeGoal?.original_goal_id ?? item.plan_goal_id;
      const key = `${originalGoalId}:${item.unit_key}`;
      const existing = dayEntries.get(key);
      dayEntries.set(key, {
        key,
        originalGoalId,
        unitKey: item.unit_key,
        label: existing?.label ?? activeGoal?.title ?? item.unit_key,
        classification: existing?.classification ?? item.classification,
        creditState: existing?.creditState ?? item.credit_state,
        activeGoal: existing?.activeGoal ?? activeGoal,
        activeItem: item,
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
    context?.activePlan?.items,
    context?.preview?.workUnits,
  ]);

  const getEntriesForDay = useCallback(
    (day: string | null) => (day ? entriesByDate.get(day) ?? [] : []),
    [entriesByDate]
  );

  const selectedDayEntries = useMemo(() => {
    return getEntriesForDay(selectedDay);
  }, [getEntriesForDay, selectedDay]);

  const selectedEventEntry = useMemo(
    () =>
      selectedEventEntryKey
        ? selectedDayEntries.find((entry) => entry.key === selectedEventEntryKey) ?? null
        : null,
    [selectedDayEntries, selectedEventEntryKey]
  );

  const previewDayEntries = useMemo(
    () => getEntriesForDay(dayPreview?.day ?? null),
    [dayPreview?.day, getEntriesForDay]
  );

  useEffect(() => {
    if (!selectedDay) {
      return;
    }
    const timer = window.setTimeout(() => {
      setMoveDateByItemId((previous) => {
        let changed = false;
        const next = { ...previous };
        for (const entry of selectedDayEntries) {
          const itemId = entry.activeItem?.id;
          if (!itemId || next[itemId]) {
            continue;
          }
          next[itemId] = selectedDay;
          changed = true;
        }
        return changed ? next : previous;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedDay, selectedDayEntries]);

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
      workUnits: context.preview?.workUnits ?? [],
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
          focusGoalIds: [],
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
      setCoachPendingPatches(coachPayload.proposal?.policyPatches ?? []);
      setCoachUnresolvedQuestions(coachPayload.proposal?.unresolvedQuestions ?? []);
    } catch {
      setCoachLoading(false);
      toast.error("Coach response failed.");
    }
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

  const openDayPreview = (day: string, target: EventTarget & HTMLElement) => {
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
    setDayPreview({ day, position });
  };

  const scheduleHoverPreview = (
    day: string,
    target: EventTarget & HTMLElement
  ) => {
    clearHoverPreviewTimer();
    hoverPreviewTimerRef.current = window.setTimeout(() => {
      openDayPreview(day, target);
    }, 1000);
  };

  const handleDayCellClick = (day: string) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    setDayPreview(null);
    onOpenDay(day);
  };

  const startLongPressPreview = (
    day: string,
    target: EventTarget & HTMLElement
  ) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      openDayPreview(day, target);
    }, 600);
  };

  const applyCoachProposal = async () => {
    if (!context?.preferences || coachPendingPatches.length === 0) {
      return;
    }
    const allowedGoalIds = new Set(
      (context.activePlan?.goals ?? []).map((goal) => goal.original_goal_id)
    );
    const priorPolicy = plannerPolicySchema.parse(context.preferences.defaultPolicy);
    const result = applyCoachPolicyPatches({
      policy: priorPolicy,
      patches: coachPendingPatches,
      allowedGoalIds,
    });
    if (result.appliedPatchCount === 0) {
      toast.error("No applicable policy changes were available to apply.");
      return;
    }

    setCoachPolicyApplying(true);
    try {
      const response = await fetch("/api/planner/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: context.preferences.timezone,
          defaultPolicy: result.policy,
        }),
      });
      const payload = (await response.json()) as PlannerErrorPayload;
      if (!response.ok) {
        toast.error(parseErrorMessage(payload, "Coach proposal apply failed."));
        return;
      }
      setCoachUndoSnapshot({
        timezone: context.preferences.timezone,
        defaultPolicy: priorPolicy,
      });
      setCoachPendingPatches([]);
      appendCoachContextEvent(
        `Applied coach proposal (${result.appliedPatchCount} patches)`
      );
      onPlannerMutation();
      await loadContext();
      toast.success("Coach proposal applied.");
    } catch {
      toast.error("Coach proposal apply failed.");
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

  const undoCoachProposal = async () => {
    if (!coachUndoSnapshot) {
      return;
    }
    setCoachPolicyApplying(true);
    try {
      const response = await fetch("/api/planner/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: coachUndoSnapshot.timezone,
          defaultPolicy: coachUndoSnapshot.defaultPolicy,
        }),
      });
      const payload = (await response.json()) as PlannerErrorPayload;
      if (!response.ok) {
        toast.error(parseErrorMessage(payload, "Undo failed."));
        return;
      }
      appendCoachContextEvent("Undid latest coach-applied proposal");
      setCoachUndoSnapshot(null);
      onPlannerMutation();
      await loadContext();
      toast.success("Latest coach apply has been undone.");
    } catch {
      toast.error("Undo failed.");
    } finally {
      setCoachPolicyApplying(false);
    }
  };

  const moveItem = async (entry: PlannerDayDetailEntry) => {
    if (!context || !entry.activeItem) {
      return;
    }

    const targetDate = moveDateByItemId[entry.activeItem.id]?.trim() ?? "";
    if (!isValidIsoDate(targetDate)) {
      toast.error("Use a valid destination date (YYYY-MM-DD).");
      return;
    }

    const mutationKey = `move:${entry.activeItem.id}`;
    setMutationLoadingKey(mutationKey);
    try {
      const response = await fetch("/api/planner/items/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: entry.activeItem.id,
          date: targetDate,
          expectedItemRevision: entry.activeItem.revision,
          expectedCanonicalRevision: context.revisions.canonicalRevision,
          expectedExecutionRevision: context.revisions.executionRevision,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(parseErrorMessage(payload, "Planner item move failed."));
        return;
      }

      onPlannerMutation();
      await loadContext();
      toast.success("Planner item moved.");
    } catch {
      toast.error("Planner item move failed.");
    } finally {
      setMutationLoadingKey(null);
    }
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
    if (!context || !selectedDay || !context.capabilities.targetedExactCompletion) {
      return;
    }

    const currentlyCredited =
      entry.creditState !== "uncredited" || Boolean(entry.activeItem?.credited_completion_id);
    const desiredFactState = currentlyCredited ? "absent" : "present";
    const mutationKey = `fact:${entry.key}`;

    setMutationLoadingKey(mutationKey);
    try {
      let response: Response | null = null;
      if (entry.activeItem) {
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

      if (!response && entry.activeGoal) {
        response = await fetch("/api/planner/goals/date-fact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planGoalId: entry.activeGoal.id,
            date: selectedDay,
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
    if (!context?.preview || !context.capabilities.plannerPlanWrites) {
      return;
    }
    const idempotencyKey = createClientUuid();
    const confirmationHash = context.preview.solver.confirmationRequired
      ? buildPlannerConfirmationHash({
          previewHash: context.preview.generationInputHash,
          issueCodes: context.preview.solver.issueCodes,
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
        previewHash: context.preview.generationInputHash,
        expectedCanonicalRevision: context.revisions.canonicalRevision,
        expectedExecutionRevision: context.revisions.executionRevision,
        expectedBasePlanId: context.activePlan?.plan.id ?? null,
        expectedBasePlanVersion: context.activePlan?.plan.version ?? null,
        confirmationHash,
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
    onPlannerMutation();
    await loadContext();
    if (context.scopeMonth && context.timezone) {
      sessionStorage.removeItem(
        buildCoachSessionKey(context.scopeMonth, context.timezone)
      );
      setCoachMessages([]);
    }
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
    onPlannerMutation();
    await loadContext();
    if (context.scopeMonth && context.timezone) {
      sessionStorage.removeItem(
        buildCoachSessionKey(context.scopeMonth, context.timezone)
      );
      setCoachMessages([]);
    }
    toast.success("Plan dismissed.");
  };

  const plannerSearchStatus = context?.preview?.solver.searchStatus;
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
  const canMutatePlanItems = Boolean(
    context?.capabilities.plannerPlanWrites &&
      context?.activePlan?.plan.status === "active"
  );

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
          {weekdayLabels.map((label, index) => (
            <label
              key={label}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={setupRestWeekdays.includes(index)}
                onChange={(event) =>
                  setSetupRestWeekdays((previous) =>
                    event.target.checked
                      ? [...previous, index]
                      : previous.filter((weekday) => weekday !== index)
                  )
                }
              />
              {label}
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
            <p className="text-sm text-muted-foreground">
              Planner preview with URL-driven month/day navigation and active-plan actions.
            </p>
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
            context.preview ? (
              <Button
                type="button"
                size="sm"
                onClick={publishPlan}
                disabled={publishLoading || loading}
              >
                {publishLoading
                  ? "Publishing..."
                  : context.activePlan
                    ? "Update Plan"
                    : "Publish Plan"}
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
              <h3 className="text-base font-semibold">{monthLabel}</h3>
              <p className="text-xs text-muted-foreground">
                Monday-first month view
              </p>
            </div>
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
              {weekdayLabels.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2" data-no-swipe="true">
              {cells.map((cell) => {
                const unitsForDay = unitsByDate.get(cell.date) ?? [];
                const entriesForDay = getEntriesForDay(cell.date);
                const status = getDayStatus(unitsForDay, "No items");
                const ariaLabel = `${format(
                  parse(cell.date, "yyyy-MM-dd", new Date()),
                  "EEEE, MMMM d, yyyy"
                )}. ${unitsForDay.length} planned item${
                  unitsForDay.length === 1 ? "" : "s"
                }. ${status}.`;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => handleDayCellClick(cell.date)}
                    onMouseEnter={(event) =>
                      scheduleHoverPreview(cell.date, event.currentTarget)
                    }
                    onMouseLeave={() => {
                      clearHoverPreviewTimer();
                      if (dayPreview?.day === cell.date) {
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
                        ? "bg-background hover:border-primary/60"
                        : "bg-muted/30 text-muted-foreground"
                    }`}
                    aria-label={ariaLabel}
                    data-no-swipe="true"
                  >
                    <p className="text-xs font-medium">{cell.date.slice(8, 10)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {unitsForDay.length} planned
                    </p>
                    <p className="text-[11px]">{status}</p>
                    {entriesForDay.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {entriesForDay.slice(0, 2).map((entry) => {
                          const visual = getGoalVisual({
                            goalId: entry.originalGoalId,
                            color: entry.activeGoal?.color ?? null,
                          });
                          const Icon = visual.Icon;
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
                                {entry.label ?? entry.unitKey}
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
              <div className="mb-2">
                <p className="text-sm font-medium">
                  {format(parse(dayPreview.day, "yyyy-MM-dd", new Date()), "EEEE, MMM d")}
                </p>
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
                    return (
                      <div
                        key={`preview-entry-${entry.key}`}
                        className="flex items-start gap-2 rounded border p-1.5"
                      >
                        <span
                          className="mt-0.5 inline-flex size-4 items-center justify-center rounded-full"
                          style={{ backgroundColor: visual.color }}
                        >
                          <Icon className="size-2.5 text-white" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {entry.label ?? entry.unitKey}
                          </p>
                          <p className="truncate text-muted-foreground">
                            {entry.classification} · {entry.creditState}
                          </p>
                        </div>
                      </div>
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
                <div className="flex justify-end">
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
                  {selectedDay ? format(parse(selectedDay, "yyyy-MM-dd", new Date()), "EEEE, MMMM d") : "Day detail"}
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
                              <p className="font-medium">{entry.label ?? entry.unitKey}</p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Goal {entry.originalGoalId} · {entry.classification} · {entry.creditState}
                            </p>
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
              }
            }}
          >
            <DialogContent aria-describedby="planner-event-detail-description">
              <DialogHeader>
                <DialogTitle>
                  {selectedEventEntry?.label ?? selectedEventEntry?.unitKey ?? "Event detail"}
                </DialogTitle>
                <DialogDescription id="planner-event-detail-description">
                  Move scheduling, lock state, and completion tracking for this event.
                </DialogDescription>
              </DialogHeader>
              {selectedEventEntry ? (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Goal {selectedEventEntry.originalGoalId} · {selectedEventEntry.classification} · {selectedEventEntry.creditState}
                  </p>
                  {selectedEventEntry.activeItem ? (
                    <div className="space-y-2 rounded-md border border-dashed p-2">
                      {(() => {
                        const eventItem = selectedEventEntry.activeItem;
                        return (
                          <>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Move to
                        <Input
                          value={
                            moveDateByItemId[eventItem.id] ??
                            selectedDay ??
                            ""
                          }
                          onChange={(event) =>
                            setMoveDateByItemId((previous) => ({
                              ...previous,
                              [eventItem.id]: event.target.value,
                            }))
                          }
                          placeholder="YYYY-MM-DD"
                          className="h-8 text-xs"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void moveItem(selectedEventEntry)}
                          disabled={Boolean(mutationLoadingKey) || !canMutatePlanItems}
                        >
                          {mutationLoadingKey === `move:${eventItem.id}`
                            ? "Moving..."
                            : "Move"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void toggleItemLock(selectedEventEntry)}
                          disabled={Boolean(mutationLoadingKey) || !canMutatePlanItems}
                        >
                          {mutationLoadingKey === `lock:${eventItem.id}`
                            ? "Saving..."
                            : eventItem.locked
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
                            !context?.capabilities.targetedExactCompletion
                          }
                        >
                          {mutationLoadingKey === `fact:${selectedEventEntry.key}`
                            ? "Saving..."
                            : selectedEventEntry.creditState === "uncredited"
                              ? "Mark done"
                              : "Undo done"}
                        </Button>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This preview item is not currently attached to an active plan row,
                      so write actions are unavailable.
                    </p>
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
