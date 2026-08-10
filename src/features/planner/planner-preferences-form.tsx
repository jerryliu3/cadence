"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  normalizeWeekStartsOn,
  restWeekdayOptions,
} from "@/features/planner/calendar-format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PlannerPreferencesFormProps {
  setupTimezone: string;
  setSetupTimezone: (timezone: string) => void;
  setupWeekStartsOn: number;
  setSetupWeekStartsOn: (weekStartsOn: number) => void;
  setupRestWeekdays: number[];
  setSetupRestWeekdays: Dispatch<SetStateAction<number[]>>;
  timezoneOptions: string[];
  setupLoading: boolean;
  submitSetup: () => void;
}

export function PlannerPreferencesForm({
  setupTimezone,
  setSetupTimezone,
  setupWeekStartsOn,
  setSetupWeekStartsOn,
  setupRestWeekdays,
  setSetupRestWeekdays,
  timezoneOptions,
  setupLoading,
  submitSetup,
}: PlannerPreferencesFormProps) {
  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span>Timezone (IANA)</span>
        <Select value={setupTimezone} onValueChange={setSetupTimezone}>
          <SelectTrigger>
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {timezoneOptions.map((timezone) => (
              <SelectItem key={timezone} value={timezone}>
                {timezone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="block space-y-1 text-sm">
        <span>First day of week</span>
        <Select
          value={`${setupWeekStartsOn}`}
          onValueChange={(value) =>
            setSetupWeekStartsOn(normalizeWeekStartsOn(Number.parseInt(value, 10)))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {restWeekdayOptions.map((option) => (
              <SelectItem key={option.value} value={`${option.value}`}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="space-y-2 text-sm">
        <p>Rest weekdays</p>
        <div className="flex flex-wrap gap-2">
          {restWeekdayOptions.map((option) => (
            <label
              key={option.label}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={setupRestWeekdays.includes(option.value)}
                onChange={(event) =>
                  setSetupRestWeekdays((previous) =>
                    event.target.checked
                      ? Array.from(new Set([...previous, option.value])).sort(
                          (left, right) => left - right
                        )
                      : previous.filter((weekday) => weekday !== option.value)
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      <Button type="button" onClick={submitSetup} disabled={setupLoading}>
        {setupLoading ? "Saving setup..." : "Save setup"}
      </Button>
    </div>
  );
}
