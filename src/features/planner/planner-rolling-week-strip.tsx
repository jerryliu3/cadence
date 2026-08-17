"use client";

import { format, parse } from "date-fns";
import type { MutableRefObject, ReactNode } from "react";
import type { PlannerCalendarViewMode } from "@/features/planner/calendar-surface.types";
import { ROLLING_WEEK_GRID_WIDTH_BY_VIEW } from "@/features/planner/calendar-rolling-week-width";

const ROLLING_WEEK_GRID_LABELS_BASE_CLASS =
  "grid min-w-[calc(7*var(--rolling-week-cell-width))] grid-cols-[repeat(7,minmax(0,var(--rolling-week-cell-width)))] gap-2 text-center text-xs text-muted-foreground";
const ROLLING_WEEK_GRID_CELLS_BASE_CLASS =
  "mt-2 grid min-w-[calc(7*var(--rolling-week-cell-width))] grid-cols-[repeat(7,minmax(0,var(--rolling-week-cell-width)))] gap-2";

interface PlannerRollingWeekStripProps {
  rollingWeekStripRef: MutableRefObject<HTMLDivElement | null>;
  viewMode: PlannerCalendarViewMode;
  focusedWeekDays: string[];
  focusedWeekCells: Array<{ date: string; inMonth: boolean }>;
  renderCalendarDayCell: (cell: { date: string; inMonth: boolean }) => ReactNode;
}

export function PlannerRollingWeekStrip({
  rollingWeekStripRef,
  viewMode,
  focusedWeekDays,
  focusedWeekCells,
  renderCalendarDayCell,
}: PlannerRollingWeekStripProps) {
  return (
    <div className="mx-auto w-full max-w-[56rem]">
      <div ref={rollingWeekStripRef} className="overflow-x-auto pb-1">
        <div
          className={`${ROLLING_WEEK_GRID_LABELS_BASE_CLASS} ${
            ROLLING_WEEK_GRID_WIDTH_BY_VIEW[viewMode === "day" ? "day" : "three_day"]
          }`}
        >
          {focusedWeekDays.map((day) => (
            <span key={`rolling-week-label-${day}`}>
              {format(parse(day, "yyyy-MM-dd", new Date()), "EEE d")}
            </span>
          ))}
        </div>
        <div
          data-rolling-week-grid="cells"
          className={`${ROLLING_WEEK_GRID_CELLS_BASE_CLASS} ${
            ROLLING_WEEK_GRID_WIDTH_BY_VIEW[viewMode === "day" ? "day" : "three_day"]
          }`}
        >
          {focusedWeekCells.map(renderCalendarDayCell)}
        </div>
      </div>
    </div>
  );
}
