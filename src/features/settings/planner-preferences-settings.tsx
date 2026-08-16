"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildTimezoneOptions } from "@/lib/dates/timezone-options";
import { weekStartOptions } from "@/lib/dates/weekday-options";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";

export interface PlannerPreferencesDraft {
  timezone: string;
  weekStartsOn: number;
}

interface PlannerPreferencesSettingsProps {
  value: PlannerPreferencesDraft;
  onChange: (next: PlannerPreferencesDraft) => void;
  disabled?: boolean;
}

export function PlannerPreferencesSettings({
  value,
  onChange,
  disabled = false,
}: PlannerPreferencesSettingsProps) {
  const timezoneOptions = useMemo(
    () => buildTimezoneOptions(value.timezone),
    [value.timezone]
  );

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <Label className="text-xs text-muted-foreground">Timezone</Label>
        <Select
          value={value.timezone}
          onValueChange={(nextTimezone) =>
            onChange({
              ...value,
              timezone: nextTimezone,
            })
          }
          disabled={disabled}
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
          value={`${value.weekStartsOn}`}
          onValueChange={(nextValue) =>
            onChange({
              ...value,
              weekStartsOn: normalizeWeekStartsOn(
                Number.parseInt(nextValue, 10)
              ),
            })
          }
          disabled={disabled}
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
    </div>
  );
}
