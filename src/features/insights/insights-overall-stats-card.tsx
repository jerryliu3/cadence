"use client";

import { type ReactNode, type RefObject } from "react";
import Link from "next/link";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import { Layers3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  CountTrendInline,
  InsightsLabelWithTooltip,
} from "@/features/insights/insights-stats-ui";
import type { InsightsStatsGroup } from "@/lib/insights/types";

type InsightsOverallStatsSummary = Pick<
  InsightsStatsGroup,
  | "totalActivities"
  | "totalGoalsCompleted"
  | "todayActivities"
  | "activeStreakDays"
  | "currentWeekActivities"
  | "currentMonthActivities"
>;

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
  overallStats,
  classForValue,
  titleForValue,
  onDayClick,
  legend,
  showMoreLink = true,
}: {
  heatmapRef: RefObject<HTMLDivElement | null>;
  selectedYearStart: Date;
  selectedYearEnd: Date;
  values: Array<{ date: string; count: number }>;
  overallCompletion: number;
  overallStats?: InsightsOverallStatsSummary | null;
  classForValue: (value?: { date?: string; count?: number }) => string;
  titleForValue: (value?: { date?: string; count?: number }) => string;
  onDayClick: (value?: { date?: string; count?: number }) => void;
  legend?: ReactNode;
  showMoreLink?: boolean;
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
        {overallStats ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="min-w-0 rounded-lg border bg-muted/20 p-2.5 sm:p-3">
                <p className="text-xs">
                  <InsightsLabelWithTooltip
                    label="Total Activities"
                    tooltip="Numerator: every completion event ever logged."
                  />
                </p>
                <p className="mt-1 text-lg font-semibold sm:text-xl">
                  {overallStats.totalActivities.toLocaleString()}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border bg-muted/20 p-2.5 sm:p-3">
                <p className="text-xs">
                  <InsightsLabelWithTooltip
                    label="Total Goals Completed"
                    tooltip="Numerator: unique goals in achieved outcome."
                  />
                </p>
                <p className="mt-1 text-lg font-semibold sm:text-xl">
                  {overallStats.totalGoalsCompleted.toLocaleString()}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border bg-muted/20 p-2.5 sm:p-3">
                <p className="text-xs">
                  <InsightsLabelWithTooltip
                    label="Current Month Activities"
                    tooltip="Numerator: completion events in the current month."
                  />
                </p>
                <p className="mt-1 text-lg font-semibold sm:text-xl">
                  {overallStats.currentMonthActivities.current.toLocaleString()}
                </p>
                <CountTrendInline
                  trend={overallStats.currentMonthActivities}
                  compareLabel="last month window"
                />
              </div>
              <div className="min-w-0 rounded-lg border bg-muted/20 p-2.5 sm:p-3">
                <p className="text-xs">
                  <InsightsLabelWithTooltip
                    label="Current Week Activities"
                    tooltip="Numerator: completion events in the current week."
                  />
                </p>
                <p className="mt-1 text-lg font-semibold sm:text-xl">
                  {overallStats.currentWeekActivities.current.toLocaleString()}
                </p>
                <CountTrendInline
                  trend={overallStats.currentWeekActivities}
                  compareLabel="last week"
                />
              </div>
              <div className="min-w-0 rounded-lg border bg-muted/20 p-2.5 sm:p-3">
                <p className="text-xs">
                  <InsightsLabelWithTooltip
                    label="Today's Activities"
                    tooltip="Numerator: completion events on today's date."
                  />
                </p>
                <p className="mt-1 text-lg font-semibold sm:text-xl">
                  {overallStats.todayActivities.toLocaleString()}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border bg-muted/20 p-2.5 sm:p-3">
                <p className="text-xs">
                  <InsightsLabelWithTooltip
                    label="Active Streak"
                    tooltip="Numerator: consecutive days ending today with more than zero completions."
                  />
                </p>
                <p className="mt-1 text-lg font-semibold sm:text-xl">
                  {overallStats.activeStreakDays.toLocaleString()} days
                </p>
              </div>
            </div>
            {showMoreLink ? (
              <div className="text-right text-sm">
                <Link href="/insights/more" className="font-medium text-primary hover:underline">
                  View more -&gt;
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall completion</span>
              <span>{Math.round(overallCompletion)}%</span>
            </div>
            <Progress value={overallCompletion} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
