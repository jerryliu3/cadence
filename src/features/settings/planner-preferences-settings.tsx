"use client";

import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage, getJson, putJson } from "@/lib/api/client";
import { invalidatePlannerRelatedTabCaches } from "@/lib/cache/planner-tab-cache";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import { buildTimezoneOptions } from "@/lib/dates/timezone-options";
import { weekStartOptions } from "@/lib/dates/weekday-options";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import { createDefaultPlannerPolicy, type PlannerPolicy } from "@/lib/planner/policy";

interface PlannerPreferencesContextPayload {
  preferences: {
    timezone: string;
    defaultPolicy: {
      weekStartsOn: number;
      restWeekdays: number[];
    };
  } | null;
}

export function PlannerPreferencesSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timezone, setTimezone] = useState(resolveUserTimezone());
  const [weekStartsOn, setWeekStartsOn] = useState(1);
  const [restWeekdays, setRestWeekdays] = useState<number[]>([]);

  const timezoneOptions = useMemo(
    () => buildTimezoneOptions(timezone),
    [timezone]
  );

  useEffect(() => {
    const loadPreferences = async () => {
      setLoading(true);
      const scopeMonth = format(new Date(), "yyyy-MM");
      try {
        const context = await getJson<PlannerPreferencesContextPayload>(
          "/api/planner/context",
          { query: { scopeMonth } }
        );
        if (context.preferences) {
          setTimezone(context.preferences.timezone);
          setWeekStartsOn(
            normalizeWeekStartsOn(context.preferences.defaultPolicy.weekStartsOn)
          );
          setRestWeekdays(context.preferences.defaultPolicy.restWeekdays ?? []);
        }
      } catch (error) {
        toast.error(
          getApiErrorMessage(error, "Planner preferences could not be loaded.")
        );
      } finally {
        setLoading(false);
      }
    };

    void loadPreferences();
  }, []);

  const savePreferences = async () => {
    setSaving(true);
    const defaultPolicy: PlannerPolicy = createDefaultPlannerPolicy(
      timezone,
      new Date().toISOString()
    );
    defaultPolicy.weekStartsOn = normalizeWeekStartsOn(weekStartsOn);
    // Rest weekdays remain owned by planner settings; preserve current value.
    defaultPolicy.restWeekdays = [...restWeekdays].sort((left, right) => left - right);

    try {
      await putJson("/api/planner/context", {
        timezone,
        defaultPolicy,
      });
      invalidatePlannerRelatedTabCaches();
      toast.success("Preferences updated.");
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Planner preferences could not be saved.")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <Label className="text-xs text-muted-foreground">Timezone</Label>
        <Select
          value={timezone}
          onValueChange={setTimezone}
          disabled={loading || saving}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {timezoneOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block space-y-1">
        <Label className="text-xs text-muted-foreground">First day of week</Label>
        <Select
          value={`${weekStartsOn}`}
          onValueChange={(value) =>
            setWeekStartsOn(normalizeWeekStartsOn(Number.parseInt(value, 10)))
          }
          disabled={loading || saving}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {weekStartOptions.map((option) => (
              <SelectItem key={option.value} value={`${option.value}`}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <Button
        type="button"
        onClick={savePreferences}
        disabled={loading || saving}
      >
        {saving ? "Saving..." : "Save preferences"}
      </Button>
    </div>
  );
}
