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
import { getLinkedGoalDeadlineLabel, getLinkedGoalRecurrenceLabel } from "@/lib/goals/linked-goal-labels";
import type { Goal } from "@/lib/goals/types";

interface GoalLinkTargetSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  filteredLinkTargets: Goal[];
  keyPrefix?: string;
}

export function GoalLinkTargetSelect({
  value,
  onValueChange,
  open,
  onOpenChange,
  searchQuery,
  onSearchQueryChange,
  filteredLinkTargets,
  keyPrefix = "",
}: GoalLinkTargetSelectProps) {
  return (
    <div className="space-y-2">
      <Label className="inline-flex items-center gap-2">
        <Link2 className="size-4 text-muted-foreground" />
        Link this goal to another goal
      </Label>
      <Select value={value} onValueChange={onValueChange} open={open} onOpenChange={onOpenChange}>
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
    </div>
  );
}
