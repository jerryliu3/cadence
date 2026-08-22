"use client";

import { Loader2, Maximize2, Minimize2 } from "lucide-react";
import { isMonthScopedCalendarViewMode } from "@cadence/shared/planner/calendar-state";
import { Button } from "@/components/ui/button";
import { PeriodStepper } from "@/components/ui/period-stepper";
import type { PlannerCalendarViewMode } from "@/features/planner/calendar-surface.types";

interface PlannerViewWindowHeaderProps {
  loading: boolean;
  viewMode: PlannerCalendarViewMode;
  previousWindowAriaLabel: string;
  nextWindowAriaLabel: string;
  fixedViewHeadingWidthCh: number;
  viewHeading: string;
  canResetViewWindow: boolean;
  viewDescription: string;
  expandedMonthRows: boolean;
  onMoveViewWindow: (direction: -1 | 1) => void;
  onToggleExpandedMonthRows: () => void;
  onResetViewWindow: () => void;
}

export function PlannerViewWindowHeader({
  loading,
  viewMode,
  previousWindowAriaLabel,
  nextWindowAriaLabel,
  fixedViewHeadingWidthCh,
  viewHeading,
  canResetViewWindow,
  viewDescription,
  expandedMonthRows,
  onMoveViewWindow,
  onToggleExpandedMonthRows,
  onResetViewWindow,
}: PlannerViewWindowHeaderProps) {
  return (
    <div className="mx-auto mb-3 w-full max-w-[56rem] space-y-3">
      <div className="space-y-2">
        <div className="relative flex w-full justify-center">
          <PeriodStepper
            className="shrink-0"
            onPrevious={() => onMoveViewWindow(-1)}
            onNext={() => onMoveViewWindow(1)}
            previousDisabled={loading}
            nextDisabled={loading}
            previousAriaLabel={previousWindowAriaLabel}
            nextAriaLabel={nextWindowAriaLabel}
            center={
              <h3
                className="truncate text-center text-base font-semibold"
                style={{ width: `${fixedViewHeadingWidthCh}ch` }}
              >
                {viewHeading}
              </h3>
            }
          />
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {isMonthScopedCalendarViewMode(viewMode) ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={loading}
                aria-label={expandedMonthRows ? "Compact rows" : "Expand rows"}
                title={expandedMonthRows ? "Compact rows" : "Expand rows"}
                onClick={onToggleExpandedMonthRows}
              >
                {expandedMonthRows ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
        {canResetViewWindow ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={loading}
              onClick={onResetViewWindow}
            >
              Today
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <p>{viewDescription}</p>
        {loading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            Updating...
          </span>
        ) : null}
      </div>
    </div>
  );
}
