"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GoalMonthOption } from "@/lib/goals/list-view";
import { cn } from "@/lib/utils";

const allCategoriesValue = "__all_categories__";
const allEndMonthsValue = "__all_end_months__";

export interface GoalCategoryFilterOption {
  value: string;
  label: string;
}

interface GoalFiltersProps {
  categoryFilterEnabled?: boolean;
  endMonthFilterEnabled?: boolean;
  categoryFilter: string;
  onCategoryFilterChange: (nextCategory: string) => void;
  categoryOptions: GoalCategoryFilterOption[];
  endMonthFilter: string | null;
  onEndMonthFilterChange: (nextEndMonth: string | null) => void;
  endMonthOptions: GoalMonthOption[];
  className?: string;
}

export function GoalFilters({
  categoryFilterEnabled = true,
  endMonthFilterEnabled = true,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  endMonthFilter,
  onEndMonthFilterChange,
  endMonthOptions,
  className,
}: GoalFiltersProps) {
  if (!categoryFilterEnabled && !endMonthFilterEnabled) {
    return null;
  }

  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {categoryFilterEnabled ? (
        <label className="block space-y-1">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
            <SelectTrigger className="h-8 rounded-full bg-background/90 text-xs">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allCategoriesValue}>All categories</SelectItem>
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : null}

      {endMonthFilterEnabled ? (
        <label className="block space-y-1">
          <Label className="text-xs text-muted-foreground">Ending in</Label>
          <Select
            value={endMonthFilter ?? allEndMonthsValue}
            onValueChange={(value) =>
              onEndMonthFilterChange(value === allEndMonthsValue ? null : value)
            }
          >
            <SelectTrigger className="h-8 rounded-full bg-background/90 text-xs">
              <SelectValue placeholder="All end months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allEndMonthsValue}>All end months</SelectItem>
              {endMonthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : null}
    </div>
  );
}

export { allCategoriesValue };
