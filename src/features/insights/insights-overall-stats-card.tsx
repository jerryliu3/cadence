"use client";

import { type ReactNode, type RefObject } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import { Layers3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const aggregateWeekdayLabels: [string, string, string, string, string, string, string] = [
  "Su",
  "M",
  "T",
  "W",
  "Th",
  "F",
  "S",
];

export function InsightsOverallStatsCard({
  heatmapRef,
  selectedYearStart,
  selectedYearEnd,
  values,
  overallCompletion,
  classForValue,
  titleForValue,
  onDayClick,
  legend,
}: {
  heatmapRef: RefObject<HTMLDivElement | null>;
  selectedYearStart: Date;
  selectedYearEnd: Date;
  values: Array<{ date: string; count: number }>;
  overallCompletion: number;
  classForValue: (value?: { date?: string; count?: number }) => string;
  titleForValue: (value?: { date?: string; count?: number }) => string;
  onDayClick: (value?: { date?: string; count?: number }) => void;
  legend?: ReactNode;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers3 className="size-4 text-primary" />
          <CardTitle>Overall stats</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-0">
          <div ref={heatmapRef} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <CalendarHeatmap
              startDate={selectedYearStart}
              endDate={selectedYearEnd}
              values={values}
              showWeekdayLabels
              weekdayLabels={aggregateWeekdayLabels}
              classForValue={(value) =>
                classForValue({
                  date: value?.date,
                  count: value?.count,
                })
              }
              titleForValue={(value) =>
                titleForValue({
                  date: value?.date,
                  count: value?.count,
                })
              }
              onClick={(value) =>
                onDayClick({
                  date: value?.date,
                  count: value?.count,
                })
              }
            />
          </div>
          {legend ?? (
            <div className="-mt-4 flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((scale) => (
                <span
                  key={scale}
                  className={`inline-block size-3 rounded-[3px] heatmap-scale-${scale}`}
                />
              ))}
              <span>More</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Overall completion</span>
          <span>{Math.round(overallCompletion)}%</span>
        </div>
        <Progress value={overallCompletion} />
      </CardContent>
    </Card>
  );
}
