"use client";

import { format, isValid, parse } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlannerAddGoalOption } from "@/features/planner/planner-add-goal-options";

interface PlannerAddInstanceDialogProps {
  open: boolean;
  targetDate: string | null;
  options: PlannerAddGoalOption[];
  selectedGoalId: string;
  submitDisabled: boolean;
  onOpenChange: (open: boolean) => void;
  onGoalChange: (goalId: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function toDayLabel(day: string | null) {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null;
  }
  const parsed = parse(day, "yyyy-MM-dd", new Date());
  if (!isValid(parsed)) {
    return null;
  }
  return format(parsed, "EEE, MMM d");
}

export function PlannerAddInstanceDialog({
  open,
  targetDate,
  options,
  selectedGoalId,
  submitDisabled,
  onOpenChange,
  onGoalChange,
  onSubmit,
  onCancel,
}: PlannerAddInstanceDialogProps) {
  const targetDayLabel = toDayLabel(targetDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Add planned activity
            {targetDayLabel ? ` - ${targetDayLabel}` : ""}
          </DialogTitle>
          <DialogDescription>
            Select a goal to add one planned activity on this day.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Goal</p>
            <Select
              value={selectedGoalId}
              onValueChange={onGoalChange}
              disabled={options.length === 0}
            >
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={
                    options.length > 0
                      ? "Select a goal"
                      : "No eligible goals for this day"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.goalId} value={option.goalId}>
                    {option.title} ({option.creditedCount}/{option.targetCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No targeted goals are eligible for manual add on this day.
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={submitDisabled}>
              Add planned activity
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
