"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CalendarTab,
  PlannerContextPayload,
  PlannerVisibleMonthContextPayload,
} from "@/features/planner/calendar-surface.types";
import {
  readTabDataCache,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";
import { MAX_HORIZON_MONTHS } from "@/lib/planner/contracts/bounds";

const VISIBLE_MONTH_FETCH_DEBOUNCE_MS = 80;
const PLANNER_VISIBLE_MONTH_CACHE_PREFIX = "planner-visible-month-context:";

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
      return () => {
        window.clearTimeout(resetTimer);
      };
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
      return () => {
        window.clearTimeout(resetTimer);
      };
    }
    let cancelled = false;
    const abortController = new AbortController();
    const cachedEntries: Array<readonly [string, PlannerVisibleMonthContextPayload]> = [];
    const monthsToFetch: string[] = [];
    for (const visibleMonth of visibleMonths) {
      const cacheKey = `${PLANNER_VISIBLE_MONTH_CACHE_PREFIX}${visibleMonth}`;
      const cachedPayload = readTabDataCache<PlannerVisibleMonthContextPayload>(cacheKey);
      if (cachedPayload) {
        cachedEntries.push([visibleMonth, cachedPayload] as const);
      } else {
        monthsToFetch.push(visibleMonth);
      }
    }

    if (monthsToFetch.length === 0) {
      const syncTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setVisibleMonthContexts(Object.fromEntries(cachedEntries));
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(syncTimer);
      };
    }

    const timer = window.setTimeout(() => {
      void Promise.allSettled(
        monthsToFetch.map(async (visibleMonth) => {
          const query = new URLSearchParams({
            scopeMonth: visibleMonth,
          });
          const response = await fetch(`/api/planner/context?${query.toString()}`, {
            cache: "no-store",
            credentials: "same-origin",
            signal: abortController.signal,
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
        .then((results) => {
          if (cancelled) {
            return;
          }
          const entries: Array<
            readonly [string, PlannerVisibleMonthContextPayload]
          > = [...cachedEntries];
          results.forEach((result, index) => {
            if (result.status === "fulfilled") {
              entries.push(result.value);
              writeTabDataCache(
                `${PLANNER_VISIBLE_MONTH_CACHE_PREFIX}${result.value[0]}`,
                result.value[1]
              );
              return;
            }
            const visibleMonth = monthsToFetch[index] ?? null;
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
    }, VISIBLE_MONTH_FETCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      abortController.abort();
      window.clearTimeout(timer);
    };
  }, [activeTab, scopeMonth, visibleMonths]);

  return visibleMonthContexts;
}
