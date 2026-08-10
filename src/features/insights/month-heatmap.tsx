"use client";

import { eachDayOfInterval, endOfMonth, format, getISODay, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHeatmapScaleClass } from "@/lib/goals/heatmap";
import { cn } from "@/lib/utils";

interface MonthHeatmapProps {
  month: Date;
  countsByDate: Record<string, number>;
  interactive?: boolean;
  pendingDate?: string | null;
  onDayClick?: (date: string) => void;
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
    <div className="space-y-2">
      {onPreviousMonth || onNextMonth ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onPreviousMonth?.()}
            disabled={!onPreviousMonth}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-[120px] text-center text-sm font-medium">{format(month, "MMMM yyyy")}</p>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onNextMonth?.()}
            disabled={!onNextMonth}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : (
        <p className="text-sm font-medium">{format(month, "MMMM yyyy")}</p>
      )}
      <div className="inline-flex flex-col gap-1">
        <div className="grid grid-cols-[repeat(7,2rem)] gap-1">
          {weekdayHeaders.map((label) => (
            <div
              key={label}
              className="flex h-4 w-8 items-end justify-center text-[10px] font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(7,2rem)] gap-1">
          {Array.from({ length: firstWeekdayOffset }).map((_, index) => (
            <div key={`offset-${index}`} className="size-8 rounded-md bg-transparent" />
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
                  onClick={() => onDayClick(key)}
                  disabled={pendingDate === key}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-[10px] text-muted-foreground transition-transform hover:scale-105 hover:ring-2 hover:ring-primary/30 disabled:opacity-60",
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
                  "flex size-8 items-center justify-center rounded-md text-[10px] text-muted-foreground",
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
