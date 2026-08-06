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

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isValidMonth(value: string | null) {
  return Boolean(value && monthPattern.test(value));
}

function isValidDate(value: string | null) {
  if (!value || !datePattern.test(value)) {
    return false;
  }
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return format(parsed, "yyyy-MM-dd") === value;
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

  const normalized = useMemo(() => {
    const dayValid = isValidDate(rawDay);
    const monthValid = isValidMonth(rawMonth);
    const nextParams = new URLSearchParams(searchParams.toString());
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
    }

    return {
      tab,
      month: isValidMonth(nextParams.get("month")) ? nextParams.get("month") : null,
      day: isValidDate(nextParams.get("day")) ? nextParams.get("day") : null,
      changed,
      nextParams,
    };
  }, [calendarEnabled, rawDay, rawMonth, rawTab, searchParams]);

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
          }
        },
        mode
      );
    },
    [applySearchParams, calendarEnabled, captureScroll, normalized.tab]
  );

  const updateMonth = useCallback(
    (month: string, mode: "push" | "replace") => {
      captureScroll(getSurfaceKey(normalized.tab));
      applySearchParams(
        (params) => {
          params.set("tab", "calendar");
          params.set("month", month);
          params.delete("day");
        },
        mode
      );
    },
    [applySearchParams, captureScroll, normalized.tab]
  );

  const closeDay = useCallback(() => {
    applySearchParams((params) => params.delete("day"), "replace");
  }, [applySearchParams]);

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
              onMonthChange={updateMonth}
              onCloseDay={closeDay}
              onPlannerMutation={onChecklistMutation}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
