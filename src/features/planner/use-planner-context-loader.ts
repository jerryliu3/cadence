"use client";

import { addMonths, format } from "date-fns";
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  getMonthInTimezone,
  normalizeWeekStartsOn,
  parseMonth,
} from "@/features/planner/calendar-format";
import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";
import { getApiErrorMessage, getJson, postJson } from "@/lib/api/client";
import {
  PLANNER_CONTEXT_CACHE_PREFIX,
} from "@/lib/cache/planner-tab-cache";
import { readTabDataCache, writeTabDataCache } from "@/lib/cache/tab-data-cache";
import { getScopeDateRange } from "@/lib/planner/dates";
import type { PlannerPolicy } from "@/lib/planner/policy";

export interface LoadPlannerContextOptions {
  showLoading?: boolean;
  toastOnError?: boolean;
  forcePrepare?: boolean;
}

interface UsePlannerContextLoaderArgs {
  activeTab: string;
  month: string | null;
  setupTimezone: string;
  onMonthChange: (month: string, mode: "push" | "replace") => void;
  setContext: Dispatch<SetStateAction<PlannerContextPayload | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSetupTimezone: Dispatch<SetStateAction<string>>;
  setSetupWeekStartsOn: Dispatch<SetStateAction<number>>;
  setSetupRestWeekdays: Dispatch<SetStateAction<number[]>>;
  draftPolicyRef: MutableRefObject<PlannerPolicy | null>;
  calendarPreparedRef: MutableRefObject<boolean>;
}

export function usePlannerContextLoader({
  activeTab,
  month,
  setupTimezone,
  onMonthChange,
  setContext,
  setLoading,
  setError,
  setSetupTimezone,
  setSetupWeekStartsOn,
  setSetupRestWeekdays,
  draftPolicyRef,
  calendarPreparedRef,
}: UsePlannerContextLoaderArgs) {
  return useCallback(
    async ({
      showLoading = true,
      toastOnError = false,
      forcePrepare = false,
    }: LoadPlannerContextOptions = {}) => {
      if (activeTab !== "calendar") {
        return false;
      }

      let shouldShowLoading = showLoading;
      if (shouldShowLoading) {
        setError(null);
      }
      if (!month) {
        const resolvedMonth = getMonthInTimezone(setupTimezone);
        onMonthChange(resolvedMonth, "replace");
        return true;
      }

      const plannerContextCacheKey = `${PLANNER_CONTEXT_CACHE_PREFIX}${month}`;
      const cachedContextPayload = readTabDataCache<PlannerContextPayload>(plannerContextCacheKey);
      if (cachedContextPayload) {
        setContext(cachedContextPayload);
        if (cachedContextPayload.preferences?.timezone) {
          const policyForSetup =
            draftPolicyRef.current ?? cachedContextPayload.preferences.defaultPolicy;
          setSetupTimezone(cachedContextPayload.preferences.timezone);
          setSetupWeekStartsOn(normalizeWeekStartsOn(policyForSetup.weekStartsOn));
          setSetupRestWeekdays(policyForSetup.restWeekdays);
        }
        shouldShowLoading = false;
      }

      if (shouldShowLoading) {
        setLoading(true);
      }
      let contextPayload: PlannerContextPayload;
      try {
        const parsedMonth = parseMonth(month);
        const visibleStart = getScopeDateRange(
          format(addMonths(parsedMonth, -1), "yyyy-MM")
        ).start;
        const visibleEnd = getScopeDateRange(
          format(addMonths(parsedMonth, 1), "yyyy-MM")
        ).end;
        const shouldPrepare = forcePrepare || !calendarPreparedRef.current;
        contextPayload = shouldPrepare
          ? await postJson<PlannerContextPayload>("/api/planner/prepare", {
              scopeMonth: month,
              visibleStart,
              visibleEnd,
            })
          : await getJson<PlannerContextPayload>("/api/planner/context", {
              query: {
                scopeMonth: month,
                visibleStart,
                visibleEnd,
              },
            });
        calendarPreparedRef.current = true;
      } catch (error) {
        if (shouldShowLoading) {
          setLoading(false);
        }
        const message = getApiErrorMessage(
          error,
          "Planner calendar context could not be loaded."
        );
        if (shouldShowLoading) {
          setContext(null);
          setError(message);
        }
        if (toastOnError) {
          toast.error(message);
        }
        return false;
      }
      if (shouldShowLoading) {
        setLoading(false);
      }
      if (!contextPayload) {
        const message = "Planner calendar context could not be loaded.";
        if (shouldShowLoading) {
          setContext(null);
          setError(message);
        }
        if (toastOnError) {
          toast.error(message);
        }
        return false;
      }

      setContext(contextPayload);
      writeTabDataCache(plannerContextCacheKey, contextPayload);
      if (contextPayload.preferences?.timezone) {
        const policyForSetup =
          draftPolicyRef.current ?? contextPayload.preferences.defaultPolicy;
        setSetupTimezone(contextPayload.preferences.timezone);
        setSetupWeekStartsOn(normalizeWeekStartsOn(policyForSetup.weekStartsOn));
        setSetupRestWeekdays(policyForSetup.restWeekdays);
      }
      return true;
    },
    [
      activeTab,
      calendarPreparedRef,
      draftPolicyRef,
      month,
      onMonthChange,
      setContext,
      setError,
      setLoading,
      setSetupRestWeekdays,
      setSetupTimezone,
      setSetupWeekStartsOn,
      setupTimezone,
    ]
  );
}
