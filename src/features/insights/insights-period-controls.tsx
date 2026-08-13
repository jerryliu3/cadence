"use client";

import { addMonths, addYears, format, subMonths, subYears } from "date-fns";
import { ChevronDown } from "lucide-react";
import { PeriodStepper } from "@/components/ui/period-stepper";
import type { HeatmapViewMode } from "@/features/insights/insights-tab";

export function InsightsPeriodControls({
  monthCursor,
  onMonthCursorChange,
  perGoalViewMode,
  onPerGoalViewModeChange,
}: {
  monthCursor: Date;
  onMonthCursorChange: (next: Date) => void;
  perGoalViewMode: HeatmapViewMode;
  onPerGoalViewModeChange: (mode: HeatmapViewMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-3">
      <PeriodStepper
        onPrevious={() =>
          onMonthCursorChange(
            perGoalViewMode === "month"
              ? subMonths(monthCursor, 1)
              : subYears(monthCursor, 1)
          )
        }
        onNext={() =>
          onMonthCursorChange(
            perGoalViewMode === "month"
              ? addMonths(monthCursor, 1)
              : addYears(monthCursor, 1)
          )
        }
        center={
          <span className="min-w-[120px] text-center text-sm font-medium text-muted-foreground">
            {perGoalViewMode === "month"
              ? format(monthCursor, "MMMM yyyy")
              : format(monthCursor, "yyyy")}
          </span>
        }
        previousAriaLabel="Previous period"
        nextAriaLabel="Next period"
      />
      <div className="space-y-1">
        <label
          htmlFor="insights-shared-goal-stats-view-mode"
          className="block text-xs text-muted-foreground"
        >
          View
        </label>
        <div className="relative w-[110px]">
          <select
            id="insights-shared-goal-stats-view-mode"
            value={perGoalViewMode}
            onChange={(event) =>
              onPerGoalViewModeChange(event.target.value as HeatmapViewMode)
            }
            className="h-8 w-full appearance-none rounded-full border border-input bg-background/90 px-3 pr-8 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Goal stats view mode"
          >
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
