"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildGoalMonthOptions,
  goalDateSortOptions,
  type GoalDateSort,
} from "@/lib/goals/list-view";
import type { Goal } from "@/lib/goals/types";
import { cn } from "@/lib/utils";

const noEndMonthValue = "__no_end_month_filter__";

interface GoalListControlsProps {
  goals: Goal[];
  referenceMonth: string;
  endMonth: string | null;
  onEndMonthChange: (month: string | null) => void;
  sort: GoalDateSort;
  onSortChange: (sort: GoalDateSort) => void;
  className?: string;
  mode?: "radix" | "native";
}

export function GoalListControls({
  goals,
  referenceMonth,
  endMonth,
  onEndMonthChange,
  sort,
  onSortChange,
  className,
  mode = "radix",
}: GoalListControlsProps) {
  const endMonthId = useId();
  const sortId = useId();
  const selectedEndMonth =
    endMonth !== null && endMonth >= referenceMonth ? endMonth : null;
  const monthOptions = buildGoalMonthOptions(
    goals,
    referenceMonth,
    selectedEndMonth ? [selectedEndMonth] : []
  );

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      <div className="space-y-1">
        <Label htmlFor={endMonthId} className="text-xs text-muted-foreground">
          Ending in
        </Label>
        {mode === "native" ? (
          <div className="relative w-[180px]">
            <select
              id={endMonthId}
              value={selectedEndMonth ?? noEndMonthValue}
              onChange={(event) =>
                onEndMonthChange(
                  event.target.value === noEndMonthValue ? null : event.target.value
                )
              }
              className="h-8 w-full appearance-none rounded-full border border-input bg-background/90 px-3 pr-8 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value={noEndMonthValue}>All end months</option>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        ) : (
          <Select
            value={selectedEndMonth ?? noEndMonthValue}
            onValueChange={(value) =>
              onEndMonthChange(value === noEndMonthValue ? null : value)
            }
          >
            <SelectTrigger
              id={endMonthId}
              className="h-8 w-[180px] rounded-full bg-background/90 text-xs"
            >
              <SelectValue placeholder="All end months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={noEndMonthValue}>All end months</SelectItem>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={sortId} className="text-xs text-muted-foreground">
          Sort goals
        </Label>
        {mode === "native" ? (
          <div className="relative w-[180px]">
            <select
              id={sortId}
              value={sort}
              onChange={(event) => onSortChange(event.target.value as GoalDateSort)}
              className="h-8 w-full appearance-none rounded-full border border-input bg-background/90 px-3 pr-8 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {goalDateSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        ) : (
          <Select value={sort} onValueChange={(value: GoalDateSort) => onSortChange(value)}>
            <SelectTrigger
              id={sortId}
              className="h-8 w-[180px] rounded-full bg-background/90 text-xs"
            >
              <SelectValue placeholder="Sort goals" />
            </SelectTrigger>
            <SelectContent>
              {goalDateSortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
