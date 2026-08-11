"use client";

import { eachDayOfInterval, endOfMonth, format, getISODay, startOfMonth } from "date-fns";
import { getHeatmapScaleClass } from "@/lib/goals/heatmap";
import { PeriodStepper } from "@/components/ui/period-stepper";
import { cn } from "@/lib/utils";

interface MonthHeatmapProps {
  month: Date;
  countsByDate: Record<string, number>;
  interactive?: boolean;
  pendingDate?: string | null;
  onDayClick?: (date: string, sourceElement: HTMLButtonElement) => void;
  onPreviousMonth?: () => void;
  onNextMonth?: () => void;
}

const weekdayHeaders = ["M", "T", "W", "Th", "F", "S", "Su"];

export function MonthHeatmap({
  month,
  countsByDate,
  interactive = false,
  pendingDate = null,
  onDayClick,
  onPreviousMonth,
  onNextMonth,
}: MonthHeatmapProps) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstWeekdayOffset = getISODay(monthStart) - 1;

  return (
    <div className="w-full space-y-2">
      {onPreviousMonth || onNextMonth ? (
        <PeriodStepper
          onPrevious={onPreviousMonth}
          onNext={onNextMonth}
          center={
            <p className="min-w-[120px] text-center text-sm font-medium">
              {format(month, "MMMM yyyy")}
            </p>
          }
          previousAriaLabel="Previous month"
          nextAriaLabel="Next month"
        />
      ) : (
        <p className="text-sm font-medium">{format(month, "MMMM yyyy")}</p>
      )}
      <div className="w-full space-y-1 [--month-cell-size:clamp(2.2rem,4.1vw,3rem)]">
        <div className="grid w-full grid-cols-[repeat(7,var(--month-cell-size))] justify-between gap-y-1">
          {weekdayHeaders.map((label) => (
            <div
              key={label}
              className="flex h-4 w-[var(--month-cell-size)] items-end justify-center text-[10px] font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid w-full grid-cols-[repeat(7,var(--month-cell-size))] justify-between gap-y-1">
          {Array.from({ length: firstWeekdayOffset }).map((_, index) => (
            <div
              key={`offset-${index}`}
              className="h-[var(--month-cell-size)] w-[var(--month-cell-size)] rounded-md bg-transparent"
            />
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const value = countsByDate[key] ?? 0;

            if (interactive && onDayClick) {
              return (
                <button
                  key={key}
                  type="button"
                  title={`${key}: ${value} completion${value === 1 ? "" : "s"}`}
                  onClick={(event) => onDayClick(key, event.currentTarget)}
                  disabled={pendingDate === key}
                  className={cn(
                    "flex h-[var(--month-cell-size)] w-[var(--month-cell-size)] items-center justify-center rounded-md text-[10px] text-muted-foreground transition-transform hover:scale-105 hover:ring-2 hover:ring-primary/30 disabled:opacity-60",
                    getHeatmapScaleClass(value)
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            }

            return (
              <div
                key={key}
                title={`${key}: ${value} completion${value === 1 ? "" : "s"}`}
                className={cn(
                  "flex h-[var(--month-cell-size)] w-[var(--month-cell-size)] items-center justify-center rounded-md text-[10px] text-muted-foreground",
                  getHeatmapScaleClass(value)
                )}
              >
                {format(day, "d")}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
