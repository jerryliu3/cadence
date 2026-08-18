"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getMonthInTimezone, normalizeWeekStartsOn } from "@/features/planner/calendar-format";
import type {
  PlannerPreferencesPayload,
} from "@/features/planner/calendar-surface.types";
import { getApiErrorMessage, putJson } from "@/lib/api/client";
import { createDefaultPlannerPolicy, type PlannerPolicy } from "@/lib/planner/policy";
import { isValidIanaTimezone } from "@/lib/dates/timezone";
import type { LoadPlannerContextOptions } from "@/features/planner/use-planner-context-loader";

interface UsePlannerSetupArgs {
  setupTimezone: string;
  setupWeekStartsOn: number;
  setupRestWeekdays: number[];
  month: string | null;
  onMonthChange: (month: string, mode: "push" | "replace") => void;
  clearDraftSession: () => void;
  handlePlannerMutation: () => void;
  loadContext: (options?: LoadPlannerContextOptions) => Promise<boolean>;
  setSettingsOpen: (open: boolean) => void;
}

export function usePlannerSetup({
  setupTimezone,
  setupWeekStartsOn,
  setupRestWeekdays,
  month,
  onMonthChange,
  clearDraftSession,
  handlePlannerMutation,
  loadContext,
  setSettingsOpen,
}: UsePlannerSetupArgs) {
  const [setupLoading, setSetupLoading] = useState(false);

  const submitSetup = useCallback(async () => {
    if (!isValidIanaTimezone(setupTimezone)) {
      toast.error("Provide a valid IANA timezone.");
      return;
    }

    setSetupLoading(true);
    const defaultPolicy = createDefaultPlannerPolicy(setupTimezone, new Date().toISOString());
    defaultPolicy.restWeekdays = [...setupRestWeekdays].sort((a, b) => a - b);
    defaultPolicy.weekStartsOn = normalizeWeekStartsOn(setupWeekStartsOn);

    try {
      await putJson<
        { message?: string; preferences?: PlannerPreferencesPayload["preferences"] },
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

    handlePlannerMutation();
    clearDraftSession();
    setSettingsOpen(false);
    if (!month) {
      onMonthChange(getMonthInTimezone(setupTimezone), "replace");
    } else {
      await loadContext();
    }
    toast.success("Planner setup saved.");
  }, [
    clearDraftSession,
    handlePlannerMutation,
    loadContext,
    month,
    onMonthChange,
    setSettingsOpen,
    setupRestWeekdays,
    setupTimezone,
    setupWeekStartsOn,
  ]);

  return {
    setupLoading,
    submitSetup,
  };
}
