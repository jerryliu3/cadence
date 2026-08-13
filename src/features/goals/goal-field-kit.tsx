"use client";

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
import { cn } from "@/lib/utils";

interface CategorySelectProps {
  value: CategorySelection;
  onValueChange: (value: CategorySelection) => void;
  placeholder?: string;
  triggerClassName?: string;
}

export function CategorySelect({
  value,
  onValueChange,
  placeholder = "Select category",
  triggerClassName,
}: CategorySelectProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as CategorySelection)}>
      <SelectTrigger className={cn(triggerClassName)}>
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
        <SelectItem value="custom">
          <span className="inline-flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: getCategorySwatchColor("custom") }}
            />
            Custom
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

interface GoalTypeToggleProps {
  value: GoalFrequencyType;
  onValueChange: (value: GoalFrequencyType) => void;
  triggerClassName?: string;
}

export function GoalTypeToggle({
  value,
  onValueChange,
  triggerClassName,
}: GoalTypeToggleProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as GoalFrequencyType)}>
      <SelectTrigger className={cn("h-9 w-full", triggerClassName)}>
        <SelectValue placeholder="Select goal type" />
      </SelectTrigger>
      <SelectContent>
        {GOAL_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface RecurrenceIntervalToggleProps {
  value: RecurrenceInterval;
  onValueChange: (value: RecurrenceInterval) => void;
  triggerClassName?: string;
}

export function RecurrenceIntervalToggle({
  value,
  onValueChange,
  triggerClassName,
}: RecurrenceIntervalToggleProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as RecurrenceInterval)}>
      <SelectTrigger className={cn("h-9 w-full", triggerClassName)}>
        <SelectValue placeholder="Select cadence" />
      </SelectTrigger>
      <SelectContent>
        {RECURRENCE_INTERVAL_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TargetCountFieldProps {
  id?: string;
  frequencyType: GoalFrequencyType;
  value: string;
  onValueChange: (value: string) => void;
  showRecurringHelperText?: boolean;
}

export function TargetCountField({
  id,
  frequencyType,
  value,
  onValueChange,
  showRecurringHelperText = true,
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
      {frequencyType === "recurring" && showRecurringHelperText ? (
        <p className="text-xs text-muted-foreground">
          Optional: set a total due by the end date. Each date is checked independently;
          target-total goals do not use current-period or streak semantics.
        </p>
      ) : null}
    </>
  );
}
