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

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function tooltipPercentFormatter(
  value: number | string | ReadonlyArray<number | string> | undefined
) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return `${Math.round(Number(resolved ?? 0))}%`;
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>

      <Card className="shadow-sm">
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

      <Card className="shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm">
            <InsightsLabelWithTooltip
              label="Completion by Day of Week (last 30 days)"
              tooltip="Numerator: completed goals on each weekday in the last 30 days. Denominator: goal opportunities on that weekday in the last 30 days."
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.completionByWeekday}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="weekdayLabel" />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={tooltipPercentFormatter} />
              <Bar dataKey="percent" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
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
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rateLineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" minTickGap={20} />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={tooltipPercentFormatter} />
              <Line type="monotone" dataKey="percent" stroke="hsl(var(--primary))" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
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
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={completionsLineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" minTickGap={20} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm">
            <InsightsLabelWithTooltip
              label="Completion Rate % by Category (last 30 days)"
              tooltip="Numerator: completed goals in each category over last 30 days. Denominator: category goal opportunities over last 30 days."
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.completionRateByCategory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="categoryLabel" interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={tooltipPercentFormatter} />
              <Bar dataKey="percent" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
        const payload = await fetchInsightsStats({ forceRefresh: true });
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
              <Link href="/insights" className="inline-flex items-center gap-1">
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
