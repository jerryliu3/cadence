"use client";

import { Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getLinkedGoalDeadlineLabel,
  getLinkedGoalRecurrenceLabel,
  getLinkedTargetSchedulingNotice,
} from "@/lib/goals/linked-goal-labels";
import type { Goal } from "@/lib/goals/types";

interface GoalLinkTargetSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  filteredLinkTargets: Goal[];
  selectedTargetGoal: Goal | null;
  sourceEndDate: string | null;
  keyPrefix?: string;
  disabled?: boolean;
  disabledReason?: string | null;
}

export function GoalLinkTargetSelect({
  value,
  onValueChange,
  open,
  onOpenChange,
  searchQuery,
  onSearchQueryChange,
  filteredLinkTargets,
  selectedTargetGoal,
  sourceEndDate,
  keyPrefix = "",
  disabled = false,
  disabledReason = null,
}: GoalLinkTargetSelectProps) {
  const linkedTargetSchedulingNotice = getLinkedTargetSchedulingNotice({
    sourceEndDate,
  });
  return (
    <div className="space-y-2">
      <Label className="inline-flex items-center gap-2">
        <Link2 className="size-4 text-muted-foreground" />
        Link this goal to another goal
      </Label>
      <Select
        value={value}
        onValueChange={onValueChange}
        open={open}
        onOpenChange={onOpenChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="No linked target" />
        </SelectTrigger>
        <SelectContent>
          <div className="sticky top-0 z-10 border-b bg-popover p-1.5">
            <Input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search link targets..."
              className="h-8"
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>
          <SelectItem value="none">No linked target</SelectItem>
          {filteredLinkTargets.map((goal) => (
            <SelectItem
              key={keyPrefix ? `${keyPrefix}-${goal.id}` : goal.id}
              value={goal.id}
            >
              <span className="flex items-center gap-2">
                <span className="max-w-[170px] truncate">{goal.title}</span>
                <Badge variant="secondary">{getLinkedGoalRecurrenceLabel(goal)}</Badge>
                <Badge variant="outline">{getLinkedGoalDeadlineLabel(goal)}</Badge>
              </span>
            </SelectItem>
          ))}
          {filteredLinkTargets.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No goals match your search.</p>
          ) : null}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Marking this goal complete will auto-complete linked goals for the same day.
      </p>
      {disabledReason ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}
      {value !== "none" && selectedTargetGoal ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">
            Linking to {selectedTargetGoal.title} affects calendar visibility.
          </p>
          <p className="mt-1">{linkedTargetSchedulingNotice}</p>
        </div>
      ) : null}
    </div>
  );
}
