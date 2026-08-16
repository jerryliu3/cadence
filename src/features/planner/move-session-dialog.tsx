"use client";

import { format, isValid, parse } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export interface MoveSourceOption {
  entryKey: string;
  sourceDay: string;
  sourceLabel: string;
}

interface MoveSessionDialogProps {
  open: boolean;
  targetDate: string;
  selectedSourceEntryKey: string;
  sourceOptions: MoveSourceOption[];
  onOpenChange: (open: boolean) => void;
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
  selectedSourceEntryKey,
  sourceOptions,
  onOpenChange,
  onSourceChange,
  onCancel,
  onSubmit,
  submitDisabled,
}: MoveSessionDialogProps) {
  const targetDateLabel =
    targetDate && isValidIsoDate(targetDate)
      ? format(parse(targetDate, "yyyy-MM-dd", new Date()), "EEE, MMM d")
      : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Move session here
            {targetDateLabel ? ` - ${targetDateLabel}` : ""}
          </DialogTitle>
          <DialogDescription>
            Choose which existing session to move to this day.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {targetDateLabel ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Move to</p>
              <Badge variant="outline" className="h-7 rounded-md px-2 text-xs font-medium">
                {targetDateLabel}
              </Badge>
            </div>
          ) : null}
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
                    {format(parse(option.sourceDay, "yyyy-MM-dd", new Date()), "EEE, MMM d")} -{" "}
                    {option.sourceLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {sourceOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No movable sessions are eligible for this day.
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
