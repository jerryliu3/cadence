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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MoveGoalOption {
  goalId: string;
  title: string;
}

export interface MoveSourceOption {
  entryKey: string;
  sourceDay: string;
}

interface MoveSessionDialogProps {
  open: boolean;
  targetDate: string;
  selectedGoalId: string;
  selectedSourceEntryKey: string;
  goalOptions: MoveGoalOption[];
  sourceOptions: MoveSourceOption[];
  onOpenChange: (open: boolean) => void;
  onTargetDateChange: (value: string) => void;
  onGoalChange: (goalId: string) => void;
  onSourceChange: (entryKey: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitDisabled: boolean;
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value;
}

export function MoveSessionDialog({
  open,
  targetDate,
  selectedGoalId,
  selectedSourceEntryKey,
  goalOptions,
  sourceOptions,
  onOpenChange,
  onTargetDateChange,
  onGoalChange,
  onSourceChange,
  onCancel,
  onSubmit,
  submitDisabled,
}: MoveSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Move session here
            {targetDate && isValidIsoDate(targetDate)
              ? ` - ${format(parse(targetDate, "yyyy-MM-dd", new Date()), "EEE, MMM d")}`
              : ""}
          </DialogTitle>
          <DialogDescription>
            Pick a goal that is valid for this day and not already scheduled here, then
            pick which existing scheduled date for that goal should be moved to this day.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Goal</p>
            <Select value={selectedGoalId} onValueChange={onGoalChange}>
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={
                    goalOptions.length > 0
                      ? "Select goal"
                      : "No eligible goals for this day"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {goalOptions.map((goal) => (
                  <SelectItem key={goal.goalId} value={goal.goalId}>
                    {goal.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Move to date</p>
            <Input
              type="date"
              value={targetDate}
              onChange={(event) => onTargetDateChange(event.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Move from date</p>
            <Select
              value={selectedSourceEntryKey}
              onValueChange={onSourceChange}
              disabled={sourceOptions.length === 0}
            >
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={
                    sourceOptions.length > 0
                      ? "Select existing scheduled date"
                      : "No move sources available"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map((option) => (
                  <SelectItem key={option.entryKey} value={option.entryKey}>
                    {format(parse(option.sourceDay, "yyyy-MM-dd", new Date()), "EEE, MMM d")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {goalOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No remaining goals are eligible for this day. Try another date or remove an
              existing session first.
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={submitDisabled}>
              Move session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
