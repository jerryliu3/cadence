"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CalendarTab,
  PlannerContextPayload,
  PlannerVisibleMonthContextPayload,
} from "@/features/planner/calendar-surface.types";

interface UsePlannerVisibleMonthContextsArgs {
  activeTab: CalendarTab;
  scopeMonth: string | null;
  visibleDays: string[];
}

export function usePlannerVisibleMonthContexts({
  activeTab,
  scopeMonth,
  visibleDays,
}: UsePlannerVisibleMonthContextsArgs) {
  const [visibleMonthContexts, setVisibleMonthContexts] = useState<
    Record<string, PlannerVisibleMonthContextPayload>
  >({});

  const visibleMonths = useMemo(() => {
    if (!scopeMonth || visibleDays.length === 0) {
      return [] as string[];
    }
    return Array.from(
      new Set(
        visibleDays
          .map((day) => day.slice(0, 7))
          .filter((month) => month !== scopeMonth)
      )
    ).sort();
  }, [scopeMonth, visibleDays]);

  useEffect(() => {
    if (
      activeTab !== "calendar" ||
      !scopeMonth ||
      visibleMonths.length === 0
    ) {
      const resetTimer = window.setTimeout(() => {
        setVisibleMonthContexts((current) =>
          Object.keys(current).length === 0 ? current : {}
        );
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all(
        visibleMonths.map(async (visibleMonth) => {
          const query = new URLSearchParams({
            scopeMonth: visibleMonth,
          });
          const response = await fetch(`/api/planner/context?${query.toString()}`, {
            cache: "no-store",
            credentials: "same-origin",
          });
          if (!response.ok) {
            throw new Error("visible_context_load_failed");
          }
          const payload = (await response.json()) as PlannerContextPayload;
          return [
            visibleMonth,
            {
              scopeMonth: payload.scopeMonth,
              goalTitles: payload.goalTitles,
              activePlan: payload.activePlan,
              preview: payload.preview,
            } satisfies PlannerVisibleMonthContextPayload,
          ] as const;
        })
      )
        .then((entries) => {
          if (cancelled) {
            return;
          }
          setVisibleMonthContexts(Object.fromEntries(entries));
        })
        .catch(() => {
          if (!cancelled) {
            setVisibleMonthContexts({});
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, scopeMonth, visibleMonths]);

  return visibleMonthContexts;
}
