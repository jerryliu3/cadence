"use client";

import { format, parse } from "date-fns";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarSurface } from "@/features/planner/calendar-surface";
import {
  type ChecklistTabValue,
  ChecklistSurface,
} from "@/features/today/checklist-surface";

type PlannerShellTab = "today" | "not-today" | "calendar";
type SurfaceKey = "checklist" | "calendar";
type PlannerCalendarViewMode = "month" | "week" | "day";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isValidMonth(value: string | null): value is string {
  return Boolean(value && monthPattern.test(value));
}

function isValidDate(value: string | null): value is string {
  if (!value || !datePattern.test(value)) {
    return false;
  }
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return format(parsed, "yyyy-MM-dd") === value;
}

function isValidCalendarViewMode(value: string | null): value is PlannerCalendarViewMode {
  return value === "month" || value === "week" || value === "day";
}

function getTodayDateParam() {
  return format(new Date(), "yyyy-MM-dd");
}

function getSurfaceKey(tab: PlannerShellTab): SurfaceKey {
  return tab === "calendar" ? "calendar" : "checklist";
}

interface ChecklistShellProps {
  calendarEnabled: boolean;
}

export function ChecklistShell({ calendarEnabled }: ChecklistShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollBySurfaceRef = useRef<Record<SurfaceKey, number>>({
    checklist: 0,
    calendar: 0,
  });
  const lastSurfaceRef = useRef<SurfaceKey>("checklist");
  const checklistContainerRef = useRef<HTMLDivElement | null>(null);
  const calendarContainerRef = useRef<HTMLDivElement | null>(null);

  const rawTab = searchParams.get("tab");
  const rawMonth = searchParams.get("month");
  const rawDay = searchParams.get("day");
  const rawView = searchParams.get("view");
  const [defaultCalendarViewMode, setDefaultCalendarViewMode] =
    useState<PlannerCalendarViewMode>("month");

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQueryList = window.matchMedia("(max-width: 767px)");
    const updateDefaultViewMode = () => {
      setDefaultCalendarViewMode(mediaQueryList.matches ? "week" : "month");
    };
    updateDefaultViewMode();
    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", updateDefaultViewMode);
      return () => mediaQueryList.removeEventListener("change", updateDefaultViewMode);
    }
    mediaQueryList.addListener(updateDefaultViewMode);
    return () => mediaQueryList.removeListener(updateDefaultViewMode);
  }, []);

  const normalized = useMemo(() => {
    const dayValid = isValidDate(rawDay);
    const monthValid = isValidMonth(rawMonth);
    const nextParams = new URLSearchParams(searchParams.toString());
    const rawViewModeValid = isValidCalendarViewMode(rawView);
    let viewMode: PlannerCalendarViewMode = rawViewModeValid
      ? rawView
      : defaultCalendarViewMode;
    let tab: PlannerShellTab =
      rawTab === "today" || rawTab === "not-today" || rawTab === "calendar"
        ? rawTab
        : "today";
    let changed = rawTab !== tab;
    if (!calendarEnabled && tab === "calendar") {
      tab = "today";
      nextParams.set("tab", "today");
      changed = true;
    }

    if (rawDay && !dayValid) {
      nextParams.delete("day");
      changed = true;
    }
    if (rawMonth && !monthValid) {
      nextParams.delete("month");
      changed = true;
    }
    if (rawView && !rawViewModeValid) {
      nextParams.delete("view");
      changed = true;
    }

    if (dayValid && calendarEnabled) {
      const dayMonth = rawDay!.slice(0, 7);
      if (nextParams.get("month") !== dayMonth) {
        nextParams.set("month", dayMonth);
        changed = true;
      }
      if (tab !== "calendar") {
        tab = "calendar";
        nextParams.set("tab", "calendar");
        changed = true;
      }
      if (!rawViewModeValid && viewMode !== "day") {
        viewMode = "day";
        nextParams.set("view", "day");
        changed = true;
      }
    } else if (nextParams.has("day")) {
      nextParams.delete("day");
      changed = true;
    }
    if (!calendarEnabled) {
      if (nextParams.has("month")) {
        nextParams.delete("month");
        changed = true;
      }
      if (nextParams.has("day")) {
        nextParams.delete("day");
        changed = true;
      }
      if (nextParams.has("view")) {
        nextParams.delete("view");
        changed = true;
      }
    }

    if (tab === "calendar" && calendarEnabled) {
      if (nextParams.get("view") !== viewMode) {
        nextParams.set("view", viewMode);
        changed = true;
      }
      if (viewMode === "day") {
        const dayParam = nextParams.get("day");
        const normalizedDay = isValidDate(dayParam) ? dayParam : getTodayDateParam();
        if (nextParams.get("day") !== normalizedDay) {
          nextParams.set("day", normalizedDay);
          changed = true;
        }
        const normalizedMonth = normalizedDay.slice(0, 7);
        if (nextParams.get("month") !== normalizedMonth) {
          nextParams.set("month", normalizedMonth);
          changed = true;
        }
      } else if (viewMode === "week") {
        const dayParam = nextParams.get("day");
        const monthParam = nextParams.get("month");
        const fallbackDay = isValidMonth(monthParam)
          ? `${monthParam}-01`
          : getTodayDateParam();
        const normalizedDay = isValidDate(dayParam) ? dayParam : fallbackDay;
        if (nextParams.get("day") !== normalizedDay) {
          nextParams.set("day", normalizedDay);
          changed = true;
        }
        const normalizedMonth = normalizedDay.slice(0, 7);
        if (nextParams.get("month") !== normalizedMonth) {
          nextParams.set("month", normalizedMonth);
          changed = true;
        }
      } else if (viewMode === "month" && nextParams.has("day")) {
        nextParams.delete("day");
        changed = true;
      }
    } else if (nextParams.has("view")) {
      nextParams.delete("view");
      changed = true;
    }
    const normalizedMonthParam = nextParams.get("month");
    const normalizedDayParam = nextParams.get("day");
    const normalizedViewParam = nextParams.get("view");
    const normalizedViewMode = isValidCalendarViewMode(normalizedViewParam)
      ? normalizedViewParam
      : viewMode;

    return {
      tab,
      month: isValidMonth(normalizedMonthParam) ? normalizedMonthParam : null,
      day: isValidDate(normalizedDayParam) ? normalizedDayParam : null,
      viewMode: normalizedViewMode,
      changed,
      nextParams,
    };
  }, [
    calendarEnabled,
    defaultCalendarViewMode,
    rawDay,
    rawMonth,
    rawTab,
    rawView,
    searchParams,
  ]);

  const [checklistMounted, setChecklistMounted] = useState(
    normalized.tab !== "calendar"
  );
  const [calendarMounted, setCalendarMounted] = useState(
    normalized.tab === "calendar"
  );
  const [checklistTab, setChecklistTab] = useState<ChecklistTabValue>(
    normalized.tab === "not-today" ? "not-today" : "today"
  );
  const [checklistRefreshToken, setChecklistRefreshToken] = useState(0);

  const applySearchParams = useCallback(
    (
      update: (params: URLSearchParams) => void,
      mode: "push" | "replace",
      state: Record<string, unknown> | null = null
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      update(params);
      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      if (mode === "push") {
        window.history.pushState(state, "", nextUrl);
      } else {
        window.history.replaceState(state, "", nextUrl);
      }
    },
    [pathname, searchParams]
  );

  const captureScroll = useCallback((surface: SurfaceKey) => {
    scrollBySurfaceRef.current[surface] = window.scrollY;
  }, []);

  const restoreScroll = useCallback((surface: SurfaceKey) => {
    const targetY = scrollBySurfaceRef.current[surface] ?? 0;
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: "auto" });
    });
  }, []);

  useEffect(() => {
    if (!normalized.changed) {
      return;
    }
    applySearchParams(
      (params) => {
        for (const key of Array.from(params.keys())) {
          params.delete(key);
        }
        for (const [key, value] of normalized.nextParams.entries()) {
          params.set(key, value);
        }
      },
      "replace"
    );
  }, [applySearchParams, normalized.changed, normalized.nextParams]);

  useEffect(() => {
    const currentSurface = getSurfaceKey(normalized.tab);
    if (currentSurface !== lastSurfaceRef.current) {
      captureScroll(lastSurfaceRef.current);
      restoreScroll(currentSurface);
      lastSurfaceRef.current = currentSurface;
    }
  }, [captureScroll, normalized.tab, restoreScroll]);

  useEffect(() => {
    const checklistContainer = checklistContainerRef.current;
    const calendarContainer = calendarContainerRef.current;
    if (checklistContainer) {
      if (normalized.tab === "calendar") {
        checklistContainer.setAttribute("inert", "");
      } else {
        checklistContainer.removeAttribute("inert");
      }
    }
    if (calendarContainer) {
      if (normalized.tab === "calendar") {
        calendarContainer.removeAttribute("inert");
      } else {
        calendarContainer.setAttribute("inert", "");
      }
    }
  }, [normalized.tab]);

  const updateTab = useCallback(
    (tab: PlannerShellTab, mode: "push" | "replace") => {
      const effectiveTab: PlannerShellTab =
        tab === "calendar" && !calendarEnabled ? "today" : tab;
      if (effectiveTab === "calendar" && calendarEnabled) {
        setCalendarMounted(true);
      } else {
        setChecklistMounted(true);
        setChecklistTab(
          effectiveTab === "not-today" ? "not-today" : "today"
        );
      }
      captureScroll(getSurfaceKey(normalized.tab));
      applySearchParams(
        (params) => {
          params.set("tab", effectiveTab);
          if (effectiveTab !== "calendar") {
            params.delete("day");
            params.delete("view");
          } else {
            params.set("view", normalized.viewMode);
            if (normalized.viewMode === "month") {
              params.delete("day");
            } else {
              const day =
                normalized.day ??
                (isValidMonth(normalized.month)
                  ? `${normalized.month}-01`
                  : getTodayDateParam());
              if (isValidDate(day)) {
                params.set("day", day);
                params.set("month", day.slice(0, 7));
              }
            }
          }
        },
        mode
      );
    },
    [
      applySearchParams,
      calendarEnabled,
      captureScroll,
      normalized.tab,
      normalized.viewMode,
    ]
  );

  const updateMonth = useCallback(
    (month: string, mode: "push" | "replace") => {
      captureScroll(getSurfaceKey(normalized.tab));
      applySearchParams(
        (params) => {
          params.set("tab", "calendar");
          params.set("view", "month");
          params.set("month", month);
          params.delete("day");
        },
        mode
      );
    },
    [applySearchParams, captureScroll, normalized.tab]
  );

  const updateViewMode = useCallback(
    (viewMode: PlannerCalendarViewMode, mode: "push" | "replace") => {
      captureScroll(getSurfaceKey(normalized.tab));
      applySearchParams(
        (params) => {
          params.set("tab", "calendar");
          params.set("view", viewMode);
          if (viewMode === "month") {
            params.delete("day");
            return;
          }
          const day =
            normalized.day ??
            (isValidMonth(normalized.month)
              ? `${normalized.month}-01`
              : getTodayDateParam());
          if (isValidDate(day)) {
            params.set("day", day);
            params.set("month", day.slice(0, 7));
          }
        },
        mode
      );
    },
    [applySearchParams, captureScroll, normalized.day, normalized.month, normalized.tab]
  );

  const updateSelectedDay = useCallback(
    (
      day: string | null,
      mode: "push" | "replace",
      nextViewMode?: PlannerCalendarViewMode
    ) => {
      captureScroll(getSurfaceKey(normalized.tab));
      applySearchParams(
        (params) => {
          params.set("tab", "calendar");
          if (day && isValidDate(day)) {
            const resolvedViewMode =
              nextViewMode ??
              (normalized.viewMode === "month" ? "day" : normalized.viewMode);
            params.set("view", resolvedViewMode);
            params.set("day", day);
            params.set("month", day.slice(0, 7));
            return;
          }
          params.set("view", nextViewMode ?? "month");
          params.delete("day");
        },
        mode
      );
    },
    [applySearchParams, captureScroll, normalized.tab, normalized.viewMode]
  );

  const onChecklistMutation = useCallback(() => {
    setChecklistRefreshToken((token) => token + 1);
  }, []);

  return (
    <div className="space-y-5">
      <Tabs
        value={normalized.tab}
        onValueChange={(value) => updateTab((value as PlannerShellTab) ?? "today", "push")}
      >
        <Card className="gap-0 p-1.5 shadow-sm">
          <TabsList
            className={`grid h-8 w-full ${
              calendarEnabled ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="not-today">Past</TabsTrigger>
            {calendarEnabled ? (
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            ) : null}
          </TabsList>
        </Card>
      </Tabs>

      <div
        ref={checklistContainerRef}
        hidden={normalized.tab === "calendar"}
        aria-hidden={normalized.tab === "calendar"}
      >
        {checklistMounted ? (
          <ChecklistSurface
            activeTab={checklistTab}
            onActiveTabChange={(tab) => {
              setChecklistTab(tab);
              updateTab(tab, "push");
            }}
            hideTabList
            isActive={normalized.tab !== "calendar"}
            refreshToken={checklistRefreshToken}
          />
        ) : null}
      </div>

      {calendarEnabled ? (
        <div
          ref={calendarContainerRef}
          hidden={normalized.tab !== "calendar"}
          aria-hidden={normalized.tab !== "calendar"}
        >
          {calendarMounted ? (
            <CalendarSurface
              activeTab={normalized.tab}
              month={normalized.month}
              selectedDay={normalized.day}
              viewMode={normalized.viewMode}
              onMonthChange={updateMonth}
              onViewModeChange={updateViewMode}
              onSelectedDayChange={updateSelectedDay}
              onPlannerMutation={onChecklistMutation}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
