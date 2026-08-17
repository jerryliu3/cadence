"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getGoalHorizonEndDate } from "@/lib/goals/definition-validation";

const GOAL_DATE_INPUT_CLASS =
  "h-8 min-h-8 w-full min-w-0 py-0 text-sm leading-none [&::-webkit-calendar-picker-indicator]:size-3.5 [&::-webkit-datetime-edit]:p-0";

interface GoalDateRangeFieldsProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  requiresEndDate: boolean;
  startDateId?: string;
  endDateId?: string;
  startDateLabel?: string;
  endDateLabel?: string;
  startDateActions?: ReactNode;
  endDateActions?: ReactNode;
  showSoftHorizonHint?: boolean;
}

export function GoalDateRangeFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  requiresEndDate,
  startDateId,
  endDateId,
  startDateLabel = "Start date",
  endDateLabel,
  startDateActions,
  endDateActions,
  showSoftHorizonHint = false,
}: GoalDateRangeFieldsProps) {
  const maxEndDate = startDate ? getGoalHorizonEndDate(startDate) ?? undefined : undefined;
  return (
    <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={startDateId}>{startDateLabel}</Label>
        <Input
          id={startDateId}
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          required
          className={GOAL_DATE_INPUT_CLASS}
        />
        {startDateActions ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">{startDateActions}</div>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={endDateId}>
          {endDateLabel ?? (requiresEndDate ? "End date" : "End date (optional)")}
        </Label>
        <Input
          id={endDateId}
          type="date"
          value={endDate}
          max={maxEndDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          required={requiresEndDate}
          className={GOAL_DATE_INPUT_CLASS}
        />
        {endDateActions ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">{endDateActions}</div>
        ) : null}
        {showSoftHorizonHint ? (
          <p className="text-xs text-muted-foreground">
            Leave blank to use a rolling 24-month planning horizon.
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface GoalDefaultTimeFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  label?: string;
  helperText?: string;
  onClear?: () => void;
}

export function GoalDefaultTimeField({
  value,
  onValueChange,
  id,
  label = "Default time of day (optional)",
  helperText = "Used as the default planner time when an item-level override is not set.",
  onClear,
}: GoalDefaultTimeFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {onClear && value ? (
          <button type="button" className="text-xs text-primary hover:underline" onClick={onClear}>
            clear
          </button>
        ) : null}
      </div>
      <Input id={id} type="time" value={value} onChange={(event) => onValueChange(event.target.value)} />
      <p className="text-xs text-muted-foreground">{helperText}</p>
    </div>
  );
}
