"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_PRESETS,
  type CategorySelection,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import { GOAL_TYPE_OPTIONS, RECURRENCE_INTERVAL_OPTIONS } from "@/lib/goals/form-options";
import type { GoalFrequencyType, RecurrenceInterval } from "@/lib/goals/types";

interface CategorySelectProps {
  value: CategorySelection;
  onValueChange: (value: CategorySelection) => void;
  placeholder?: string;
}

export function CategorySelect({
  value,
  onValueChange,
  placeholder = "Select category",
}: CategorySelectProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as CategorySelection)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {CATEGORY_PRESETS.map((preset) => (
          <SelectItem key={preset.id} value={preset.id}>
            <span className="inline-flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: getCategorySwatchColor(preset.id) }}
              />
              {preset.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface GoalTypeToggleProps {
  value: GoalFrequencyType;
  onValueChange: (value: GoalFrequencyType) => void;
}

export function GoalTypeToggle({ value, onValueChange }: GoalTypeToggleProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {GOAL_TYPE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "secondary" : "outline"}
          className="rounded-full"
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

interface RecurrenceIntervalToggleProps {
  value: RecurrenceInterval;
  onValueChange: (value: RecurrenceInterval) => void;
}

export function RecurrenceIntervalToggle({
  value,
  onValueChange,
}: RecurrenceIntervalToggleProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {RECURRENCE_INTERVAL_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "secondary" : "outline"}
          className="rounded-full"
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

interface TargetCountFieldProps {
  id?: string;
  frequencyType: GoalFrequencyType;
  value: string;
  onValueChange: (value: string) => void;
}

export function TargetCountField({
  id,
  frequencyType,
  value,
  onValueChange,
}: TargetCountFieldProps) {
  return (
    <>
      <Input
        id={id}
        type="number"
        min={frequencyType === "fixed_milestones" ? 1 : 0}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        required={frequencyType === "fixed_milestones"}
      />
      {frequencyType === "recurring" ? (
        <p className="text-xs text-muted-foreground">
          Optional: set a total due by the end date. Each date is checked independently;
          target-total goals do not use current-period or streak semantics.
        </p>
      ) : null}
    </>
  );
}
