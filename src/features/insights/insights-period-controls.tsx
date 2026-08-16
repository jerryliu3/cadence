"use client";

import { addMonths, addYears, format, subMonths, subYears } from "date-fns";
import { ChevronDown } from "lucide-react";
import { PeriodStepper } from "@/components/ui/period-stepper";
import type { HeatmapViewMode } from "@/features/insights/insights-tab";

export function InsightsPeriodStepper({
  monthCursor,
  onMonthCursorChange,
  perGoalViewMode,
}: {
  monthCursor: Date;
  onMonthCursorChange: (next: Date) => void;
  perGoalViewMode: HeatmapViewMode;
}) {
  const monthPickerValue = format(monthCursor, "yyyy-MM");
  return (
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
        <label className="relative min-w-[120px] cursor-pointer text-center text-sm font-medium text-muted-foreground">
          <span>
            {perGoalViewMode === "month"
              ? format(monthCursor, "MMMM yyyy")
              : format(monthCursor, "yyyy")}
          </span>
          <input
            type="month"
            value={monthPickerValue}
            onClick={(event) => {
              event.currentTarget.showPicker?.();
            }}
            onChange={(event) => {
              const [yearText, monthText] = event.target.value.split("-");
              const year = Number(yearText);
              const month = Number(monthText);
              if (!Number.isFinite(year) || !Number.isFinite(month)) {
                return;
              }
              onMonthCursorChange(new Date(year, month - 1, 1));
            }}
            aria-label="Choose month and year"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      }
      previousAriaLabel="Previous period"
      nextAriaLabel="Next period"
    />
  );
}

export function InsightsPeriodControls({
  monthCursor,
  onMonthCursorChange,
  perGoalViewMode,
  onPerGoalViewModeChange,
  includeStepper = true,
  viewModeSelectId = "insights-shared-goal-stats-view-mode",
}: {
  monthCursor: Date;
  onMonthCursorChange: (next: Date) => void;
  perGoalViewMode: HeatmapViewMode;
  onPerGoalViewModeChange: (mode: HeatmapViewMode) => void;
  includeStepper?: boolean;
  viewModeSelectId?: string;
}) {
  return (
    <div
      className={
        includeStepper ? "flex flex-wrap items-end justify-center gap-3" : undefined
      }
    >
      {includeStepper ? (
        <InsightsPeriodStepper
          monthCursor={monthCursor}
          onMonthCursorChange={onMonthCursorChange}
          perGoalViewMode={perGoalViewMode}
        />
      ) : null}
      <div className="space-y-1">
        <label
          htmlFor={viewModeSelectId}
          className="block text-xs text-muted-foreground"
        >
          View
        </label>
        <div className="relative w-[110px]">
          <select
            id={viewModeSelectId}
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
