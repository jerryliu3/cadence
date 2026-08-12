"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
}: GoalDateRangeFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={startDateId}>{startDateLabel}</Label>
          {startDateActions}
        </div>
        <Input
          id={startDateId}
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={endDateId}>
            {endDateLabel ?? (requiresEndDate ? "End date" : "End date (optional)")}
          </Label>
          {endDateActions}
        </div>
        <Input
          id={endDateId}
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          required={requiresEndDate}
        />
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
