"use client";

import { addMonths, format, parseISO } from "date-fns";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  endMonths: string[];
  onEndMonthsChange: (months: string[]) => void;
  sort: GoalDateSort;
  onSortChange: (sort: GoalDateSort) => void;
  monthCursor: Date;
  onMonthCursorChange: (next: Date) => void;
  viewMode: HeatmapViewMode;
  onViewModeChange: (mode: HeatmapViewMode) => void;
  showPastGoals: boolean;
  pastGoalCount: number;
  onShowPastGoalsChange: (show: boolean) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InsightsGoalStatsFilters({
  goals,
  referenceMonth,
  endMonths,
  onEndMonthsChange,
  sort,
  onSortChange,
  monthCursor,
  onMonthCursorChange,
  viewMode,
  onViewModeChange,
  showPastGoals,
  pastGoalCount,
  onShowPastGoalsChange,
  open,
  onOpenChange,
}: InsightsGoalStatsFiltersProps) {
  const quickEndMonths = useMemo<
    Array<{ key: string; label: string; value: string | null }>
  >(() => {
    const referenceDate = parseISO(`${referenceMonth}-01`);
    return [
      { key: "all-end-months", label: "All End Months", value: null },
      { key: "this-month", label: "This month", value: referenceMonth },
      {
        key: "next-month",
        label: "Next month",
        value: format(addMonths(referenceDate, 1), "yyyy-MM"),
      },
      {
        key: "year-end",
        label: "Year end",
        value: `${referenceMonth.slice(0, 4)}-12`,
      },
    ];
  }, [referenceMonth]);

  return (
    <>
      <div
        data-testid="insights-quick-filters"
        className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1"
      >
        {quickEndMonths.map((option) => (
          <Button
            key={option.key}
            type="button"
            variant={
              option.value === null
                ? endMonths.length === 0
                  ? "default"
                  : "outline"
                : endMonths.includes(option.value)
                  ? "default"
                  : "outline"
            }
            size="sm"
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            onClick={() => {
              if (option.value === null) {
                onEndMonthsChange([]);
                return;
              }
              onEndMonthsChange(
                endMonths.includes(option.value)
                  ? endMonths.filter((month) => month !== option.value)
                  : [...endMonths, option.value]
              );
            }}
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
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            onClick={() => onViewModeChange(mode)}
          >
            {mode === "month" ? "Month view" : "Year view"}
          </Button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            // Prevent a nested select from auto-opening when the sheet mounts.
            event.preventDefault();
          }}
          className="top-auto bottom-0 left-1/2 max-h-[85vh] max-w-[calc(100%-1rem)] -translate-x-1/2 translate-y-0 overflow-y-auto rounded-b-none rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl"
        >
          <DialogHeader>
            <DialogTitle>Insights filters</DialogTitle>
            <DialogDescription>
              Refine which goal statistics are shown.
            </DialogDescription>
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
              endMonths={endMonths}
              onEndMonthsChange={onEndMonthsChange}
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
