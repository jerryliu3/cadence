"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarSurface } from "@/features/planner/calendar-surface";
import {
  getTodayDateParam,
  isValidDate,
  isValidMonth,
  normalizeCalendarRoute,
  type PlannerCalendarViewMode,
} from "@/features/today/checklist-shell-routing";

export function CalendarPageShell() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
      normalizeCalendarRoute({
        searchParams,
        defaultCalendarViewMode,
      }),
    [defaultCalendarViewMode, searchParams]
  );

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

  const updateMonth = useCallback(
    (month: string, mode: "push" | "replace") => {
      applySearchParams(
        (params) => {
          params.set("view", "month");
          params.set("month", month);
          params.delete("day");
        },
        mode
      );
    },
    [applySearchParams]
  );

  const updateViewMode = useCallback(
    (viewMode: PlannerCalendarViewMode, mode: "push" | "replace") => {
      applySearchParams(
        (params) => {
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
    [applySearchParams, normalized.day, normalized.month]
  );

  const updateSelectedDay = useCallback(
    (
      day: string | null,
      mode: "push" | "replace",
      nextViewMode?: PlannerCalendarViewMode
    ) => {
      applySearchParams(
        (params) => {
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
    [applySearchParams, normalized.viewMode]
  );

  return (
    <CalendarSurface
      activeTab="calendar"
      month={normalized.month}
      selectedDay={normalized.day}
      viewMode={normalized.viewMode}
      onMonthChange={updateMonth}
      onViewModeChange={updateViewMode}
      onSelectedDayChange={updateSelectedDay}
      onPlannerMutation={() => {}}
    />
  );
}
