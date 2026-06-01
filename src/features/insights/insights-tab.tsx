"use client";

import { addMonths, endOfYear, startOfYear, subMonths } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, Flame, Layers3, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MonthHeatmap } from "@/features/insights/month-heatmap";
import { getGoalCompletionPercentage, getOverallCompletionPercentage, getRecurringStreaks } from "@/lib/goals/progress";
import type { Completion, Goal, GoalParticipant } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";

interface InsightsData {
  userId: string;
  goals: Goal[];
  completions: Completion[];
  participants: GoalParticipant[];
}

const emptyInsights: InsightsData = {
  userId: "",
  goals: [],
  completions: [],
  participants: [],
};

function groupCompletionsByGoal(completions: Completion[]) {
  const map = new Map<string, Completion[]>();
  completions.forEach((completion) => {
    const existing = map.get(completion.goal_id) ?? [];
    existing.push(completion);
    map.set(completion.goal_id, existing);
  });
  return map;
}

function goalCompletionCountsByDate(completions: Completion[]) {
  return completions.reduce<Record<string, number>>((accumulator, completion) => {
    accumulator[completion.completed_on] = (accumulator[completion.completed_on] ?? 0) + 1;
    return accumulator;
  }, {});
}

function scaleClass(count: number) {
  if (!count) return "heatmap-scale-0";
  if (count === 1) return "heatmap-scale-1";
  if (count === 2) return "heatmap-scale-2";
  if (count === 3) return "heatmap-scale-3";
  return "heatmap-scale-4";
}

export function InsightsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<InsightsData>(emptyInsights);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setState(emptyInsights);
      setLoading(false);
      return;
    }

    const [goalsResponse, completionsResponse, participantsResponse] = await Promise.all([
      supabase.from("goals").select("*").order("title"),
      supabase.from("completions").select("*").eq("user_id", user.id),
      supabase.from("goal_participants").select("*").eq("user_id", user.id),
    ]);

    setState({
      userId: user.id,
      goals: (goalsResponse.data ?? []) as Goal[],
      completions: (completionsResponse.data ?? []) as Completion[],
      participants: (participantsResponse.data ?? []) as GoalParticipant[],
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const run = async () => {
      await loadData();
    };

    void run();
  }, [loadData]);

  const completableGoalIds = useMemo(() => {
    const ids = new Set<string>();
    state.goals.forEach((goal) => {
      if (goal.owner_id === state.userId) {
        ids.add(goal.id);
      }
    });
    state.participants.forEach((participant) => ids.add(participant.goal_id));
    return ids;
  }, [state.goals, state.participants, state.userId]);

  const personalGoals = useMemo(
    () => state.goals.filter((goal) => completableGoalIds.has(goal.id)),
    [completableGoalIds, state.goals]
  );

  const personalCompletions = useMemo(
    () => state.completions.filter((completion) => completableGoalIds.has(completion.goal_id)),
    [completableGoalIds, state.completions]
  );

  const completionsByGoal = useMemo(
    () => groupCompletionsByGoal(personalCompletions),
    [personalCompletions]
  );

  const aggregateCountsByDate = useMemo(
    () => goalCompletionCountsByDate(personalCompletions),
    [personalCompletions]
  );

  const aggregateHeatmapData = useMemo(() => {
    return Object.entries(aggregateCountsByDate).map(([date, count]) => ({
      date,
      count,
    }));
  }, [aggregateCountsByDate]);

  const overallCompletion = useMemo(
    () => getOverallCompletionPercentage(personalGoals, completionsByGoal),
    [completionsByGoal, personalGoals]
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading insights...</CardTitle>
          <CardDescription>Crunching your completion history.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers3 className="size-4 text-primary" />
            <CardTitle>Aggregate consistency</CardTitle>
          </div>
          <CardDescription>GitHub-style yearly view across all your completable goals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border bg-card p-3">
            <CalendarHeatmap
              startDate={startOfYear(new Date())}
              endDate={endOfYear(new Date())}
              values={aggregateHeatmapData}
              classForValue={(value) => scaleClass(value?.count ?? 0)}
              titleForValue={(value) =>
                `${value?.date ?? "N/A"}: ${value?.count ?? 0} completion${
                  (value?.count ?? 0) === 1 ? "" : "s"
                }`
              }
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall completion quality</span>
            <span>{Math.round(overallCompletion)}%</span>
          </div>
          <Progress value={overallCompletion} />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Per-goal monthly heatmaps</CardTitle>
              <CardDescription>Navigate by month to inspect each goal pattern.</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setMonthCursor((prev) => subMonths(prev, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {personalGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals available yet.</p>
          ) : (
            personalGoals.map((goal) => {
              const completions = completionsByGoal.get(goal.id) ?? [];
              const countsByDate = goalCompletionCountsByDate(completions);
              const percent = getGoalCompletionPercentage(goal, completions);
              const streaks = getRecurringStreaks(goal, completions);
              return (
                <Card key={goal.id} className="border shadow-none">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{goal.title}</p>
                        <p className="text-xs text-muted-foreground">{goal.category}</p>
                      </div>
                      <Badge variant="secondary">{Math.round(percent)}%</Badge>
                    </div>

                    <MonthHeatmap month={monthCursor} countsByDate={countsByDate} />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="size-3" />
                          Completion
                        </span>
                        <span>{Math.round(percent)}%</span>
                      </div>
                      <Progress value={percent} />
                    </div>

                    {goal.frequency_type === "recurring" ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Flame className="size-3" />
                          Current streak: {streaks.current}
                        </span>
                        <span>Longest streak: {streaks.longest}</span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="inline-flex items-center gap-1">
          <CalendarRange className="size-3" />
          Recurring adherence is completed periods divided by elapsed expected periods since start date.
        </p>
      </div>
    </div>
  );
}
