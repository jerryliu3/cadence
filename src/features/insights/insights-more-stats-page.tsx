"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/loading-card";
import {
  InsightsLabelWithTooltip,
  CountTrendInline,
  RateTrendInline,
} from "@/features/insights/insights-stats-ui";
import {
  fetchInsightsStats,
  InsightsStatsAuthenticationError,
} from "@/lib/insights/stats";
import type { InsightsStatsGroup, InsightsStatsResponse } from "@/lib/insights/types";

interface StatsSectionProps {
  title: string;
  stats: InsightsStatsGroup;
}

const CHART_COLORS = {
  primary: "#16a34a",
  secondary: "#0f766e",
  accent: "#84cc16",
  highlight: "#eab308",
  grid: "rgba(148, 163, 184, 0.25)",
  axis: "#64748b",
  tooltipBg: "rgba(15, 23, 42, 0.95)",
  tooltipText: "#e2e8f0",
} as const;

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function tooltipPercentFormatter(
  value: number | string | ReadonlyArray<number | string> | undefined
) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return `${Math.round(Number(resolved ?? 0))}%`;
}

function tooltipCountFormatter(
  value: number | string | ReadonlyArray<number | string> | undefined
) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return Number(resolved ?? 0).toLocaleString();
}

function EmptyChartState({ copy }: { copy: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      {copy}
    </div>
  );
}

function StatsSection({ title, stats }: StatsSectionProps) {
  const rateLineData = useMemo(
    () =>
      stats.completionRateByDay.map((point) => ({
        date: point.date.slice(5),
        percent: Number(point.percent.toFixed(2)),
      })),
    [stats.completionRateByDay]
  );

  const completionsLineData = useMemo(
    () =>
      stats.completionsPerDay.map((point) => ({
        date: point.date.slice(5),
        value: point.value,
      })),
    [stats.completionsPerDay]
  );

  const hasWeekdayData = stats.completionByWeekday.some((point) => point.denominator > 0);
  const hasRateLineData = stats.completionRateByDay.some(
    (point) => point.denominator > 0 || point.numerator > 0
  );
  const hasCompletionsLineData = stats.completionsPerDay.some((point) => point.value > 0);
  const hasCategoryData = stats.completionRateByCategory.some((point) => point.denominator > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Summary percentages</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs">
              <InsightsLabelWithTooltip
                label="Current Week Completion %"
                tooltip="Numerator: completed goals this week. Denominator: goal opportunities this week, with weekly/monthly/milestone opportunities only counted on completion days."
              />
            </p>
            <p className="mt-1 text-xl font-semibold">
              {formatPercent(stats.currentWeekCompletion.percent)}
            </p>
            <RateTrendInline trend={stats.currentWeekCompletion} compareLabel="last week" />
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs">
              <InsightsLabelWithTooltip
                label="Current Month Completion %"
                tooltip="Numerator: completed goals this month. Denominator: goal opportunities this month, with weekly/monthly/milestone opportunities only counted on completion days."
              />
            </p>
            <p className="mt-1 text-xl font-semibold">
              {formatPercent(stats.currentMonthCompletion.percent)}
            </p>
            <RateTrendInline
              trend={stats.currentMonthCompletion}
              compareLabel="last month window"
            />
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs">
              <InsightsLabelWithTooltip
                label="Total Active Days %"
                tooltip="Numerator: days since account creation with one or more completions. Denominator: total days since account creation."
              />
            </p>
            <p className="mt-1 text-xl font-semibold">
              {formatPercent(stats.totalActiveDaysPercent.percent)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs">
              <InsightsLabelWithTooltip
                label="Total Days #"
                tooltip="Numerator: total days elapsed since account creation. Denominator: not applicable."
              />
            </p>
            <p className="mt-1 text-xl font-semibold">{stats.totalDays.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm">
            <InsightsLabelWithTooltip
              label="Completion by Day of Week (last 30 days)"
              tooltip="Numerator: completed goals on each weekday in the last 30 days. Denominator: goal opportunities on that weekday in the last 30 days."
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {hasWeekdayData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.completionByWeekday}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="weekdayLabel" tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} />
                <Tooltip
                  formatter={tooltipPercentFormatter}
                  contentStyle={{
                    background: CHART_COLORS.tooltipBg,
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    borderRadius: "8px",
                    color: CHART_COLORS.tooltipText,
                  }}
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                />
                <Bar dataKey="percent" fill={CHART_COLORS.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState copy="No completion-rate data yet for weekday breakdown." />
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm">
            <InsightsLabelWithTooltip
              label="Completion Rate % by Day (last 30 days)"
              tooltip="Numerator: completed goals each day. Denominator: goal opportunities each day, with weekly/monthly/milestone opportunities only counted on completion days."
            />
          </CardTitle>
          <RateTrendInline trend={stats.rolling30DaysCompletion} compareLabel="previous 30 days" />
        </CardHeader>
        <CardContent className="h-64">
          {hasRateLineData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rateLineData}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  minTickGap={20}
                  tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
                />
                <YAxis domain={[0, 100]} tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} />
                <Tooltip
                  formatter={tooltipPercentFormatter}
                  contentStyle={{
                    background: CHART_COLORS.tooltipBg,
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    borderRadius: "8px",
                    color: CHART_COLORS.tooltipText,
                  }}
                  cursor={{ stroke: CHART_COLORS.accent, strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="percent"
                  stroke={CHART_COLORS.secondary}
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: CHART_COLORS.accent, strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: CHART_COLORS.highlight, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState copy="No completion-rate data yet for daily trend." />
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm">
            <InsightsLabelWithTooltip
              label="Completions per Day (last 30 days)"
              tooltip="Numerator: completion events per day. Denominator: not applicable."
            />
          </CardTitle>
          <CountTrendInline trend={stats.rolling30DaysActivities} compareLabel="previous 30 days" />
        </CardHeader>
        <CardContent className="h-64">
          {hasCompletionsLineData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={completionsLineData}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  minTickGap={20}
                  tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
                />
                <YAxis tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} />
                <Tooltip
                  formatter={tooltipCountFormatter}
                  contentStyle={{
                    background: CHART_COLORS.tooltipBg,
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    borderRadius: "8px",
                    color: CHART_COLORS.tooltipText,
                  }}
                  cursor={{ stroke: CHART_COLORS.secondary, strokeWidth: 1 }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: CHART_COLORS.accent, strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: CHART_COLORS.highlight, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState copy="No completion events yet for daily activity trend." />
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm">
            <InsightsLabelWithTooltip
              label="Completion Rate % by Category (last 30 days)"
              tooltip="Numerator: completed goals in each category over last 30 days. Denominator: category goal opportunities over last 30 days."
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {hasCategoryData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.completionRateByCategory}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="categoryLabel"
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
                />
                <YAxis domain={[0, 100]} tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} />
                <Tooltip
                  formatter={tooltipPercentFormatter}
                  contentStyle={{
                    background: CHART_COLORS.tooltipBg,
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    borderRadius: "8px",
                    color: CHART_COLORS.tooltipText,
                  }}
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                />
                <Bar dataKey="percent" fill={CHART_COLORS.accent} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState copy="No category completion-rate data yet." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function InsightsMoreStatsPage() {
  const [stats, setStats] = useState<InsightsStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const payload = await fetchInsightsStats();
        if (cancelled) {
          return;
        }
        setStats(payload);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        if (loadError instanceof InsightsStatsAuthenticationError) {
          setError("Please sign in again to view more stats.");
        } else {
          setError(loadError instanceof Error ? loadError.message : "More stats could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <LoadingCard
        title="Loading more stats..."
        description="Crunching trend and completion metrics."
      />
    );
  }

  if (!stats || error) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-6 text-sm text-muted-foreground">
          {error ?? "More stats are unavailable right now."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>More stats</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/insights" className="inline-flex items-center gap-1">
                <ArrowLeft className="size-3.5" />
                Back
              </Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      <StatsSection title="Your Goals" stats={stats.overall} />
      {stats.team ? <StatsSection title="Team Goals" stats={stats.team} /> : null}
    </div>
  );
}
