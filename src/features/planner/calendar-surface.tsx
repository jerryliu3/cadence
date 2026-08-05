"use client";

import { addMonths, format, parse } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildMondayFirstMonthCells } from "@/features/planner/month-cells";
import { getDateInTimezone, isValidIanaTimezone } from "@/lib/dates/timezone";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

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
    defaultPolicy: {
      restWeekdays: number[];
      spacingStrategy: "front_load" | "even" | "flexible";
    };
  } | null;
  capabilities: {
    plannerRead: boolean;
    plannerGeneration: boolean;
  };
  preview: {
    solver: {
      placementStatus: "complete" | "partial";
      searchStatus:
        | "all_units_placed"
        | "maximum_partial"
        | "blocked_invalid_lock"
        | "soft_optimization_exhausted";
    };
    workUnits: PlannerWorkUnit[];
  } | null;
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
    defaultPolicy: {
      restWeekdays: number[];
      spacingStrategy: "front_load" | "even" | "flexible";
    };
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
  const [error, setError] = useState<string | null>(null);
  const [setupTimezone, setSetupTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [setupSpacing, setSetupSpacing] = useState<"front_load" | "even" | "flexible">(
    "even"
  );
  const [setupRestWeekdays, setSetupRestWeekdays] = useState<number[]>([]);

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
  const selectedDayUnits = selectedDay ? unitsByDate.get(selectedDay) ?? [] : [];

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
    if (!month) {
      onMonthChange(getMonthInTimezone(setupTimezone), "replace");
    } else {
      await loadContext();
    }
    toast.success("Planner setup saved.");
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
              Read-only planner preview with URL-driven month/day navigation.
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
                    onClick={() => onOpenDay(cell.date)}
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
                  </button>
                );
              })}
            </div>
          </div>

          <Dialog open={Boolean(selectedDay)} onOpenChange={(open) => (!open ? onCloseDay() : undefined)}>
            <DialogContent
              className="top-auto bottom-0 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl"
              aria-describedby="planner-day-detail-description"
            >
              <DialogHeader>
                <DialogTitle>
                  {selectedDay ? format(parse(selectedDay, "yyyy-MM-dd", new Date()), "EEEE, MMMM d") : "Day detail"}
                </DialogTitle>
                <DialogDescription id="planner-day-detail-description">
                  Read-only planned sessions for this date.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto pr-1" data-no-swipe="true">
                {selectedDayUnits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No planned sessions for this date.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDayUnits.map((unit) => (
                      <li key={`${unit.originalGoalId}-${unit.unitKey}`} className="rounded-lg border p-2 text-sm">
                        <p className="font-medium">{unit.label ?? unit.unitKey}</p>
                        <p className="text-xs text-muted-foreground">
                          Goal {unit.originalGoalId} · {unit.classification} · {unit.creditState}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
