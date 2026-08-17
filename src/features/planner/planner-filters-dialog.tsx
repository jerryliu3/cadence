"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GoalFilters,
  type GoalCategoryFilterOption,
} from "@/features/goals/goal-filters";
import type { GoalMonthOption } from "@/lib/goals/list-view";

interface PlannerFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categoryOptions: GoalCategoryFilterOption[];
  endMonthFilter: string | null;
  onEndMonthFilterChange: (value: string | null) => void;
  endMonthOptions: GoalMonthOption[];
}

export function PlannerFiltersDialog({
  open,
  onOpenChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  endMonthFilter,
  onEndMonthFilterChange,
  endMonthOptions,
}: PlannerFiltersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Calendar filters</DialogTitle>
          <DialogDescription>
            Filter the currently visible calendar entries.
          </DialogDescription>
        </DialogHeader>
        <GoalFilters
          categoryFilterEnabled
          endMonthFilterEnabled
          categoryFilter={categoryFilter}
          onCategoryFilterChange={onCategoryFilterChange}
          categoryOptions={categoryOptions}
          endMonthFilter={endMonthFilter}
          onEndMonthFilterChange={onEndMonthFilterChange}
          endMonthOptions={endMonthOptions}
        />
      </DialogContent>
    </Dialog>
  );
}
