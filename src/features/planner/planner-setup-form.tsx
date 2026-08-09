"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PlannerSetupFormProps {
  timezone: string;
  timezoneOptions: string[];
  weekStartsOn: number;
  restWeekdays: number[];
  weekDayOptions: Array<{ value: number; label: string }>;
  submitting: boolean;
  onTimezoneChange: (value: string) => void;
  onWeekStartsOnChange: (value: number) => void;
  onRestWeekdayToggle: (value: number, checked: boolean) => void;
  onSubmit: () => void;
}

export function PlannerSetupForm({
  timezone,
  timezoneOptions,
  weekStartsOn,
  restWeekdays,
  weekDayOptions,
  submitting,
  onTimezoneChange,
  onWeekStartsOnChange,
  onRestWeekdayToggle,
  onSubmit,
}: PlannerSetupFormProps) {
  return (
    <div className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span>Timezone (IANA)</span>
        <Select value={timezone} onValueChange={onTimezoneChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {timezoneOptions.map((optionTimezone) => (
              <SelectItem key={optionTimezone} value={optionTimezone}>
                {optionTimezone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="block space-y-1 text-sm">
        <span>First day of week</span>
        <Select
          value={`${weekStartsOn}`}
          onValueChange={(value) => {
            onWeekStartsOnChange(Number.parseInt(value, 10));
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {weekDayOptions.map((option) => (
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
          {weekDayOptions.map((option) => (
            <label
              key={option.label}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={restWeekdays.includes(option.value)}
                onChange={(event) => {
                  onRestWeekdayToggle(option.value, event.target.checked);
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      <Button type="button" onClick={onSubmit} disabled={submitting}>
        {submitting ? "Saving setup..." : "Save setup"}
      </Button>
    </div>
  );
}
