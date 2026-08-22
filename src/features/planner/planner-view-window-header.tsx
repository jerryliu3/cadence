"use client";

import { Loader2, Maximize2, Minimize2 } from "lucide-react";
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
  showTodayShortcut: boolean;
  expandedMonthRows: boolean;
  onMoveViewWindow: (direction: -1 | 1) => void;
  onJumpToToday: () => void;
  onToggleExpandedMonthRows: () => void;
  onOpenMonthView: () => void;
}

export function PlannerViewWindowHeader({
  loading,
  viewMode,
  previousWindowAriaLabel,
  nextWindowAriaLabel,
  fixedViewHeadingWidthCh,
  viewHeading,
  showTodayShortcut,
  expandedMonthRows,
  onMoveViewWindow,
  onJumpToToday,
  onToggleExpandedMonthRows,
  onOpenMonthView,
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
            {viewMode === "month" ? (
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
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={onOpenMonthView}
              >
                Month View
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="flex min-h-8 items-center justify-center">
        {showTodayShortcut ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onJumpToToday}
          >
            Today
          </Button>
        ) : loading ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Updating...
          </span>
        ) : null}
      </div>
    </div>
  );
}
