"use client";

import { motion } from "motion/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarSurface } from "@/features/planner/calendar-surface";
import {
  getSurfaceKey,
  getTodayDateParam,
  isValidDate,
  isValidMonth,
  normalizeChecklistShellRoute,
  type PlannerCalendarViewMode,
  type PlannerShellTab,
  type SurfaceKey,
} from "@/features/today/checklist-shell-routing";
import {
  type ChecklistTabValue,
  ChecklistSurface,
} from "@/features/today/checklist-surface";

export function ChecklistShell() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollBySurfaceRef = useRef<Record<SurfaceKey, number>>({
    checklist: 0,
    calendar: 0,
  });
  const lastSurfaceRef = useRef<SurfaceKey>("checklist");
  const checklistContainerRef = useRef<HTMLDivElement | null>(null);
  const calendarContainerRef = useRef<HTMLDivElement | null>(null);

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

  const normalized = useMemo(
    () =>
      normalizeChecklistShellRoute({
        searchParams,
        defaultCalendarViewMode,
      }),
    [defaultCalendarViewMode, searchParams]
  );

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
      const currentQuery = searchParams.toString();
      const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;
      if (nextUrl === currentUrl) {
        return;
      }
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
      if (tab === "calendar") {
        setCalendarMounted(true);
      } else {
        setChecklistMounted(true);
        setChecklistTab(tab === "not-today" ? "not-today" : "today");
      }
      captureScroll(getSurfaceKey(normalized.tab));
      applySearchParams(
        (params) => {
          params.set("tab", tab);
          if (tab === "calendar") {
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
      captureScroll,
      normalized.day,
      normalized.month,
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
          <TabsList className="grid h-8 w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="not-today">Past</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
        </Card>
      </Tabs>

      <motion.div
        ref={checklistContainerRef}
        aria-hidden={normalized.tab === "calendar"}
        data-motion="checklist-surface"
        initial={false}
        animate={{
          opacity: normalized.tab === "calendar" ? 0 : 1,
          x: normalized.tab === "calendar" ? -18 : 0,
        }}
        transition={{
          duration: 0.2,
          ease: [0.16, 1, 0.3, 1],
        }}
        className={
          normalized.tab === "calendar"
            ? "pointer-events-none h-0 overflow-hidden"
            : undefined
        }
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
      </motion.div>

      <motion.div
        ref={calendarContainerRef}
        aria-hidden={normalized.tab !== "calendar"}
        data-motion="calendar-surface"
        initial={false}
        animate={{
          opacity: normalized.tab === "calendar" ? 1 : 0,
        }}
        transition={{
          duration: 0.2,
          ease: [0.16, 1, 0.3, 1],
        }}
        className={
          normalized.tab !== "calendar"
            ? "pointer-events-none h-0 overflow-hidden"
            : undefined
        }
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
      </motion.div>
    </div>
  );
}
