"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CalendarTab,
  PlannerContextPayload,
  PlannerVisibleMonthContextPayload,
} from "@/features/planner/calendar-surface.types";
import {
  PLANNER_VISIBLE_MONTH_CONTEXT_CACHE_PREFIX as PLANNER_VISIBLE_MONTH_CACHE_PREFIX,
} from "@/lib/cache/planner-tab-cache";
import {
  readTabDataCache,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";
import { MAX_HORIZON_MONTHS } from "@/lib/planner/contracts/bounds";

const VISIBLE_MONTH_FETCH_DEBOUNCE_MS = 80;

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
    let syncTimer: number | null = null;
    const cachedEntries: Array<readonly [string, PlannerVisibleMonthContextPayload]> = [];
    for (const visibleMonth of visibleMonths) {
      const cacheKey = `${PLANNER_VISIBLE_MONTH_CACHE_PREFIX}${visibleMonth}`;
      const cachedPayload = readTabDataCache<PlannerVisibleMonthContextPayload>(cacheKey);
      if (cachedPayload) {
        cachedEntries.push([visibleMonth, cachedPayload] as const);
      }
    }

    if (cachedEntries.length > 0) {
      syncTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setVisibleMonthContexts(Object.fromEntries(cachedEntries));
      }, 0);
    }

    const timer = window.setTimeout(() => {
      void Promise.allSettled(
        visibleMonths.map(async (visibleMonth) => {
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
          const entryMap = new Map<
            string,
            PlannerVisibleMonthContextPayload
          >(cachedEntries);
          results.forEach((result, index) => {
            if (result.status === "fulfilled") {
              entryMap.set(result.value[0], result.value[1]);
              writeTabDataCache(
                `${PLANNER_VISIBLE_MONTH_CACHE_PREFIX}${result.value[0]}`,
                result.value[1]
              );
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
          setVisibleMonthContexts(Object.fromEntries(entryMap.entries()));
        });
    }, VISIBLE_MONTH_FETCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      abortController.abort();
      window.clearTimeout(timer);
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer);
      }
    };
  }, [activeTab, scopeMonth, visibleMonths]);

  return visibleMonthContexts;
}
