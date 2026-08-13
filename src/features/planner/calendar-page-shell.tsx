"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { CalendarSurface } from "@/features/planner/calendar-surface";
import {
  getTodayDateParam,
  isValidDate,
  isValidMonth,
  normalizeCalendarRoute,
  type PlannerCalendarViewMode,
} from "@/features/today/checklist-shell-routing";
import { useClientSearchParamsUpdater } from "@/lib/navigation/use-client-search-params-updater";
import { useMediaQuery } from "@/lib/ui/use-media-query";

export function CalendarPageShell() {
  const searchParams = useSearchParams();
  const { applySearchParams } = useClientSearchParamsUpdater();
  const isMobileViewport = useMediaQuery("(max-width: 767px)");
  const defaultCalendarViewMode: PlannerCalendarViewMode = isMobileViewport ? "week" : "month";

  const normalized = useMemo(
    () =>
      normalizeCalendarRoute({
        searchParams,
        defaultCalendarViewMode,
      }),
    [defaultCalendarViewMode, searchParams]
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
