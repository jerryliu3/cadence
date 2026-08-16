"use client";

import { addMonths, format, parseISO } from "date-fns";
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoalListControls } from "@/features/goals/goal-list-controls";
import { InsightsPeriodControls } from "@/features/insights/insights-period-controls";
import type { HeatmapViewMode } from "@/features/insights/insights-tab";
import type { GoalDateSort } from "@/lib/goals/list-view";
import type { Goal } from "@/lib/goals/types";

interface InsightsGoalStatsFiltersProps {
  goals: Goal[];
  referenceMonth: string;
  endMonth: string | null;
  onEndMonthChange: (month: string | null) => void;
  sort: GoalDateSort;
  onSortChange: (sort: GoalDateSort) => void;
  monthCursor: Date;
  onMonthCursorChange: (next: Date) => void;
  viewMode: HeatmapViewMode;
  onViewModeChange: (mode: HeatmapViewMode) => void;
  showPastGoals: boolean;
  pastGoalCount: number;
  onShowPastGoalsChange: (show: boolean) => void;
}

export function InsightsGoalStatsFilters({
  goals,
  referenceMonth,
  endMonth,
  onEndMonthChange,
  sort,
  onSortChange,
  monthCursor,
  onMonthCursorChange,
  viewMode,
  onViewModeChange,
  showPastGoals,
  pastGoalCount,
  onShowPastGoalsChange,
}: InsightsGoalStatsFiltersProps) {
  const [open, setOpen] = useState(false);
  const quickEndMonths = useMemo(() => {
    const referenceDate = parseISO(`${referenceMonth}-01`);
    return [
      { label: "This month", value: referenceMonth },
      {
        label: "Next month",
        value: format(addMonths(referenceDate, 1), "yyyy-MM"),
      },
      { label: "Year end", value: `${referenceMonth.slice(0, 4)}-12` },
    ];
  }, [referenceMonth]);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-0 rounded-full px-3 text-xs"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
        </Button>
        {quickEndMonths.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={endMonth === option.value ? "default" : "outline"}
            size="sm"
            className="h-8 min-w-0 rounded-full px-3 text-xs"
            onClick={() =>
              onEndMonthChange(endMonth === option.value ? null : option.value)
            }
          >
            {option.label}
          </Button>
        ))}
        {(["month", "year"] as const).map((mode) => (
          <Button
            key={mode}
            type="button"
            variant={viewMode === mode ? "default" : "outline"}
            size="sm"
            className="h-8 min-w-0 rounded-full px-3 text-xs"
            onClick={() => onViewModeChange(mode)}
          >
            {mode === "month" ? "Month view" : "Year view"}
          </Button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-auto bottom-0 left-1/2 max-h-[85vh] max-w-[calc(100%-1rem)] -translate-x-1/2 translate-y-0 overflow-y-auto rounded-b-none rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl">
          <DialogHeader>
            <DialogTitle>Insights filters</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <InsightsPeriodControls
              monthCursor={monthCursor}
              onMonthCursorChange={onMonthCursorChange}
              perGoalViewMode={viewMode}
              onPerGoalViewModeChange={onViewModeChange}
              includeStepper={false}
              viewModeSelectId="insights-goal-stats-filter-view-mode"
            />
            <GoalListControls
              goals={goals}
              referenceMonth={referenceMonth}
              endMonth={endMonth}
              onEndMonthChange={onEndMonthChange}
              sort={sort}
              onSortChange={onSortChange}
              className="grid grid-cols-2 gap-3 [&>div]:min-w-0 [&>div]:w-full [&_[role=combobox]]:w-full"
            />
            <label
              className={`flex min-h-8 items-center gap-2 text-sm ${
                pastGoalCount === 0 ? "text-muted-foreground opacity-60" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={showPastGoals}
                disabled={pastGoalCount === 0}
                onChange={(event) => onShowPastGoalsChange(event.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              Show past goals
              <span>({pastGoalCount})</span>
            </label>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
