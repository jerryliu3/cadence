"use client";

import { eachDayOfInterval, endOfMonth, format, getISODay, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

interface MonthHeatmapProps {
  month: Date;
  countsByDate: Record<string, number>;
}

function getScaleClass(value: number) {
  if (value <= 0) {
    return "heatmap-scale-0";
  }
  if (value === 1) {
    return "heatmap-scale-1";
  }
  if (value === 2) {
    return "heatmap-scale-2";
  }
  if (value === 3) {
    return "heatmap-scale-3";
  }
  return "heatmap-scale-4";
}

export function MonthHeatmap({ month, countsByDate }: MonthHeatmapProps) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstWeekdayOffset = getISODay(monthStart) - 1;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{format(month, "MMMM yyyy")}</p>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekdayOffset }).map((_, index) => (
          <div key={`offset-${index}`} className="size-8 rounded-md bg-transparent" />
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const value = countsByDate[key] ?? 0;
          return (
            <div
              key={key}
              title={`${key}: ${value} completion${value === 1 ? "" : "s"}`}
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-[10px] text-muted-foreground",
                getScaleClass(value)
              )}
            >
              {format(day, "d")}
            </div>
          );
        })}
      </div>
    </div>
  );
}
