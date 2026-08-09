"use client";

import { useEffect, useMemo, useState } from "react";
import { getJson } from "@/lib/api/client";
import type {
  CalendarTab,
  PlannerContextPayload,
  PlannerVisibleMonthContextPayload,
} from "@/features/planner/calendar-surface.types";
import { MAX_HORIZON_MONTHS } from "@/lib/planner/contracts/bounds";

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
    if (visibleMonths.length > MAX_HORIZON_MONTHS) {
      console.error("[planner-visible-contexts] visible month window exceeded", {
        scopeMonth,
        visibleMonthCount: visibleMonths.length,
      });
      const resetTimer = window.setTimeout(() => {
        setVisibleMonthContexts((current) =>
          Object.keys(current).length === 0 ? current : {}
        );
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    let cancelled = false;
    const abortController = new AbortController();
    const timer = window.setTimeout(() => {
      void Promise.allSettled(
        visibleMonths.map(async (visibleMonth) => {
          const payload = await getJson<PlannerContextPayload>("/api/planner/context", {
            query: { scopeMonth: visibleMonth },
            signal: abortController.signal,
          });
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
        .then((results) => {
          if (cancelled) {
            return;
          }
          const entries: Array<
            readonly [string, PlannerVisibleMonthContextPayload]
          > = [];
          results.forEach((result, index) => {
            if (result.status === "fulfilled") {
              entries.push(result.value);
              return;
            }
            const visibleMonth = visibleMonths[index] ?? null;
            const errorMessage =
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason);
            console.error("[planner-visible-contexts] failed to load month context", {
              scopeMonth,
              visibleMonth,
              error: errorMessage,
            });
          });
          setVisibleMonthContexts(Object.fromEntries(entries));
        });
    }, 0);
    return () => {
      cancelled = true;
      abortController.abort();
      window.clearTimeout(timer);
    };
  }, [activeTab, scopeMonth, visibleMonths]);

  return visibleMonthContexts;
}
