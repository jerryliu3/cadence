"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CalendarTab,
  PlannerVisibleMonthContextPayload,
  PlannerVisibleWindowContextPayload,
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

  const visibleWindowRange = useMemo(() => {
    if (visibleDays.length === 0) {
      return null;
    }
    const sortedDays = [...visibleDays].sort();
    const startDate = sortedDays[0] ?? null;
    const endDate = sortedDays.at(-1) ?? null;
    if (!startDate || !endDate) {
      return null;
    }
    return { startDate, endDate };
  }, [visibleDays]);

  useEffect(() => {
    if (
      activeTab !== "calendar" ||
      !scopeMonth ||
      !visibleWindowRange ||
      (visibleWindowRange.startDate.slice(0, 7) === scopeMonth &&
        visibleWindowRange.endDate.slice(0, 7) === scopeMonth)
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
      const query = new URLSearchParams({
        scopeMonth,
        startDate: visibleWindowRange.startDate,
        endDate: visibleWindowRange.endDate,
      });
      void fetch(`/api/planner/context/visible?${query.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("visible_context_load_failed");
          }
          const payload =
            (await response.json()) as PlannerVisibleWindowContextPayload;
          if (cancelled) {
            return;
          }
          setVisibleMonthContexts(payload.contextsByMonth ?? {});
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
  }, [activeTab, scopeMonth, visibleWindowRange]);

  return visibleMonthContexts;
}
