"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getMonthInTimezone,
  normalizeWeekStartsOn,
} from "@/features/planner/calendar-format";
import type {
  CalendarTab,
  PlannerContextPayload,
} from "@/features/planner/calendar-surface.types";
import { getApiErrorMessage, getJson, putJson } from "@/lib/api/client";
import { isValidIanaTimezone } from "@/lib/dates/timezone";
import {
  createDefaultPlannerPolicy,
  type PlannerPolicy,
} from "@/lib/planner/policy";

interface UsePlannerContextSetupOptions {
  activeTab: CalendarTab;
  month: string | null;
  onMonthChange: (month: string, mode: "push" | "replace") => void;
  onPlannerMutation: () => void;
  onSetupApplied: () => void;
  autoLoad?: boolean;
}

export function usePlannerContextSetup({
  activeTab,
  month,
  onMonthChange,
  onPlannerMutation,
  onSetupApplied,
  autoLoad = true,
}: UsePlannerContextSetupOptions) {
  const [context, setContext] = useState<PlannerContextPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupTimezone, setSetupTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [setupWeekStartsOn, setSetupWeekStartsOn] = useState(1);
  const [setupRestWeekdays, setSetupRestWeekdays] = useState<number[]>([]);

  const timezoneOptions = useMemo(() => {
    const intlWithSupportedValues = Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    };
    const supportedTimezones =
      typeof intlWithSupportedValues.supportedValuesOf === "function"
        ? intlWithSupportedValues.supportedValuesOf("timeZone")
        : [];
    const detectedTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return Array.from(
      new Set(
        [setupTimezone, detectedTimezone, "UTC", ...supportedTimezones].filter(
          (timezone): timezone is string => Boolean(timezone)
        )
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [setupTimezone]);

  const loadContext = useCallback(
    async ({
      showLoading = true,
      toastOnError = false,
    }: {
      showLoading?: boolean;
      toastOnError?: boolean;
    } = {}) => {
      if (activeTab !== "calendar") {
        return false;
      }

      if (showLoading) {
        setError(null);
      }
      if (!month) {
        const resolvedMonth = getMonthInTimezone(setupTimezone);
        onMonthChange(resolvedMonth, "replace");
        return true;
      }

      if (showLoading) {
        setLoading(true);
      }
      let contextPayload: PlannerContextPayload;
      try {
        contextPayload = await getJson<PlannerContextPayload>("/api/planner/context", {
          query: { scopeMonth: month },
        });
      } catch (error) {
        if (showLoading) {
          setLoading(false);
        }
        const message = getApiErrorMessage(
          error,
          "Planner calendar context could not be loaded."
        );
        if (showLoading) {
          setContext(null);
          setError(message);
        }
        if (toastOnError) {
          toast.error(message);
        }
        return false;
      }
      if (showLoading) {
        setLoading(false);
      }

      setContext(contextPayload);
      if (contextPayload.preferences?.timezone) {
        setSetupTimezone(contextPayload.preferences.timezone);
        setSetupWeekStartsOn(
          normalizeWeekStartsOn(contextPayload.preferences.defaultPolicy.weekStartsOn)
        );
        setSetupRestWeekdays(contextPayload.preferences.defaultPolicy.restWeekdays);
      }
      return true;
    },
    [activeTab, month, onMonthChange, setupTimezone]
  );

  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadContext();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoLoad, loadContext]);

  const submitSetup = useCallback(async () => {
    if (!isValidIanaTimezone(setupTimezone)) {
      toast.error("Provide a valid IANA timezone.");
      return;
    }

    setSetupLoading(true);
    const defaultPolicy = createDefaultPlannerPolicy(
      setupTimezone,
      new Date().toISOString()
    );
    defaultPolicy.restWeekdays = [...setupRestWeekdays].sort((a, b) => a - b);
    defaultPolicy.weekStartsOn = normalizeWeekStartsOn(setupWeekStartsOn);

    try {
      await putJson<
        { message?: string; preferences?: PlannerContextPayload["preferences"] },
        {
          timezone: string;
          defaultPolicy: PlannerPolicy;
        }
      >("/api/planner/context", {
        timezone: setupTimezone,
        defaultPolicy,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Planner setup could not be saved."));
      setSetupLoading(false);
      return;
    }
    setSetupLoading(false);

    onPlannerMutation();
    onSetupApplied();
    if (!month) {
      onMonthChange(getMonthInTimezone(setupTimezone), "replace");
    } else {
      await loadContext();
    }
    toast.success("Planner setup saved.");
  }, [
    loadContext,
    month,
    onMonthChange,
    onPlannerMutation,
    onSetupApplied,
    setupRestWeekdays,
    setupTimezone,
    setupWeekStartsOn,
  ]);

  return {
    context,
    loading,
    setupLoading,
    error,
    setupTimezone,
    setSetupTimezone,
    setupWeekStartsOn,
    setSetupWeekStartsOn,
    setupRestWeekdays,
    setSetupRestWeekdays,
    timezoneOptions,
    loadContext,
    submitSetup,
  };
}
