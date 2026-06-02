"use client";

import {
  addMonths,
  endOfYear,
  isAfter,
  parseISO,
  startOfDay,
  startOfYear,
  subMonths,
} from "date-fns";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Flame,
  Layers3,
  PencilLine,
  TrendingUp,
} from "lucide-react";
import { type TouchEventHandler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { MonthHeatmap } from "@/features/insights/month-heatmap";
import { toLocalDateString } from "@/lib/dates/day";
import { getCategoryBadgeClass } from "@/lib/goals/category";
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

const aggregateWeekdayLabels: [string, string, string, string, string, string, string] = [
  "Su",
  "M",
  "T",
  "W",
  "Th",
  "F",
  "S",
];

function defaultMilestoneName(index: number): string {
  return `Milestone ${index + 1}`;
}

function buildMilestoneNames(targetCount: number, names: string[] | null | undefined): string[] {
  const safeTarget = Math.max(targetCount, 1);
  return Array.from({ length: safeTarget }, (_, index) => {
    const value = names?.[index]?.trim();
    return value && value.length > 0 ? value : defaultMilestoneName(index);
  });
}

function areMilestoneNamesEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((name, index) => name === right[index]);
}

interface MilestoneStepsProps {
  targetCount: number;
  completions: Completion[];
  milestoneNames?: string[];
  interactive?: boolean;
  pending?: boolean;
  onStepClick?: () => void;
}

function MilestoneSteps({
  targetCount,
  completions,
  milestoneNames = [],
  interactive = false,
  pending = false,
  onStepClick,
}: MilestoneStepsProps) {
  const sortedCompletions = [...completions].sort((left, right) =>
    left.completed_on.localeCompare(right.completed_on)
  );
  const safeTarget = Math.max(targetCount, 1);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Fixed steps (independent of selected month)
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: safeTarget }).map((_, index) => {
          const completion = sortedCompletions[index];
          const complete = Boolean(completion);
          const milestoneName = milestoneNames[index] ?? defaultMilestoneName(index);
          const stepContent = (
            <>
              <p className="font-medium">{milestoneName}</p>
              <p className="text-muted-foreground">
                {complete ? `Done on ${completion.completed_on}` : "Pending"}
              </p>
            </>
          );

          if (interactive && !complete && onStepClick) {
            return (
              <button
                key={`${index + 1}-step`}
                type="button"
                disabled={pending}
                onClick={onStepClick}
                className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-60"
              >
                {stepContent}
              </button>
            );
          }

          return (
            <div
              key={`${index + 1}-step`}
              className={`rounded-lg border px-3 py-2 text-xs ${
                complete ? "border-primary/40 bg-primary/10" : "border-border bg-muted/30"
              }`}
            >
              {stepContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InsightsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<InsightsData>(emptyInsights);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [pendingRetroDate, setPendingRetroDate] = useState<string | null>(null);
  const [milestoneNameDrafts, setMilestoneNameDrafts] = useState<Record<string, string[]>>({});
  const [savingMilestoneNamesGoalId, setSavingMilestoneNamesGoalId] = useState<string | null>(
    null
  );
  const monthSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const loadData = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (showLoading) {
        setLoading(true);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setState(emptyInsights);
        if (showLoading) {
          setLoading(false);
        }
        return;
      }

      const [goalsResponse, completionsResponse, participantsResponse] = await Promise.all([
        supabase.from("goals").select("*").eq("is_deleted", false).order("title"),
        supabase.from("completions").select("*").eq("user_id", user.id),
        supabase.from("goal_participants").select("*").eq("user_id", user.id),
      ]);

      setState({
        userId: user.id,
        goals: (goalsResponse.data ?? []) as Goal[],
        completions: (completionsResponse.data ?? []) as Completion[],
        participants: (participantsResponse.data ?? []) as GoalParticipant[],
      });

      if (showLoading) {
        setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    const run = async () => {
      await loadData();
    };

    void run();
  }, [loadData]);

  const completableGoalIds = useMemo(() => {
    const ids = new Set<string>();
    const visibleGoalIds = new Set(state.goals.map((goal) => goal.id));

    state.goals.forEach((goal) => {
      if (goal.owner_id === state.userId) {
        ids.add(goal.id);
      }
    });

    state.participants.forEach((participant) => {
      if (visibleGoalIds.has(participant.goal_id)) {
        ids.add(participant.goal_id);
      }
    });
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

  const markRetroactiveCompletion = useCallback(
    async (goal: Goal, completionDate: string) => {
      if (isAfter(parseISO(completionDate), startOfDay(new Date()))) {
        toast.error("You can only mark today or past dates.");
        return;
      }

      setPendingRetroDate(completionDate);
      const currentScrollY = window.scrollY;
      try {
        const { error } = await supabase.rpc("mark_goal_complete", {
          p_goal_id: goal.id,
          p_date: completionDate,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success(`Marked ${completionDate} complete.`);
        await loadData({ showLoading: false });
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
      } finally {
        setPendingRetroDate(null);
      }
    },
    [loadData, supabase]
  );

  const saveMilestoneNames = useCallback(
    async (goal: Goal, names: string[]) => {
      if (goal.owner_id !== state.userId) {
        toast.error("Only the goal owner can rename fixed steps.");
        return;
      }

      setSavingMilestoneNamesGoalId(goal.id);
      const currentScrollY = window.scrollY;
      try {
        const { error } = await supabase
          .from("goals")
          .update({ milestone_names: names })
          .eq("id", goal.id)
          .eq("owner_id", state.userId);

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Fixed step names updated.");
        await loadData({ showLoading: false });
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
      } finally {
        setSavingMilestoneNamesGoalId(null);
      }
    },
    [loadData, state.userId, supabase]
  );

  const onMonthSectionTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    if (event.touches.length !== 1) {
      monthSwipeStartRef.current = null;
      return;
    }

    const target = event.target as HTMLElement | null;
    const isInteractiveElement = target?.closest(
      "button,a,input,textarea,select,label,[role='button']"
    );
    if (isInteractiveElement) {
      monthSwipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    monthSwipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const onMonthSectionTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    const swipeStart = monthSwipeStartRef.current;
    monthSwipeStartRef.current = null;

    if (!swipeStart || event.changedTouches.length === 0) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = touch.clientY - swipeStart.y;

    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    setMonthCursor((previous) => (deltaX < 0 ? addMonths(previous, 1) : subMonths(previous, 1)));
  };

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
          <div className="overflow-x-auto rounded-xl border bg-card p-4">
            <CalendarHeatmap
              startDate={startOfYear(new Date())}
              endDate={endOfYear(new Date())}
              values={aggregateHeatmapData}
              showWeekdayLabels
              weekdayLabels={aggregateWeekdayLabels}
              classForValue={(value) => scaleClass(value?.count ?? 0)}
              titleForValue={(value) =>
                `${value?.date ?? "N/A"}: ${value?.count ?? 0} completion${
                  (value?.count ?? 0) === 1 ? "" : "s"
                }`
              }
            />
          </div>
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((scale) => (
              <span
                key={scale}
                className={`inline-block size-3 rounded-[3px] heatmap-scale-${scale}`}
              />
            ))}
            <span>More</span>
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
        <CardContent
          className="space-y-3"
          data-no-swipe="true"
          onTouchStart={onMonthSectionTouchStart}
          onTouchEnd={onMonthSectionTouchEnd}
        >
          {personalGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals available yet.</p>
          ) : (
            personalGoals.map((goal) => {
              const completions = completionsByGoal.get(goal.id) ?? [];
              const countsByDate = goalCompletionCountsByDate(completions);
              const percent = getGoalCompletionPercentage(goal, completions);
              const streaks = getRecurringStreaks(goal, completions);
              const isRecurring = goal.frequency_type === "recurring";
              const isMilestone = goal.frequency_type === "fixed_milestones";
              const editingHistory = editingGoalId === goal.id;
              const milestoneTargetCount = Math.max(goal.target_count ?? completions.length, 1);
              const persistedMilestoneNames = isMilestone
                ? buildMilestoneNames(milestoneTargetCount, goal.milestone_names)
                : [];
              const draftMilestoneNames =
                milestoneNameDrafts[goal.id] ?? persistedMilestoneNames;
              const milestoneNamesChanged = !areMilestoneNamesEqual(
                draftMilestoneNames,
                persistedMilestoneNames
              );
              const canRenameMilestones = isMilestone && goal.owner_id === state.userId;
              return (
                <Card key={goal.id} className="border shadow-none">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: goal.color ?? "var(--muted-foreground)" }}
                        />
                        <p className="truncate text-sm font-semibold">{goal.title}</p>
                        <Badge
                          variant="outline"
                          className={getCategoryBadgeClass(goal.category)}
                        >
                          {goal.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{Math.round(percent)}%</Badge>
                        {isRecurring || isMilestone ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={editingHistory ? "secondary" : "outline"}
                            onClick={() => {
                              setEditingGoalId((previous) =>
                                previous === goal.id ? null : goal.id
                              );
                              if (!editingHistory && isMilestone) {
                                setMilestoneNameDrafts((previous) => ({
                                  ...previous,
                                  [goal.id]: persistedMilestoneNames,
                                }));
                              }
                            }}
                          >
                            <PencilLine className="size-3.5" />
                            {editingHistory
                              ? "Done"
                              : isRecurring
                                ? "Edit dates"
                                : "Edit fixed"}
                          </Button>
                        ) : null}
                        {editingHistory && canRenameMilestones ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              savingMilestoneNamesGoalId === goal.id || !milestoneNamesChanged
                            }
                            onClick={() =>
                              void saveMilestoneNames(
                                goal,
                                buildMilestoneNames(milestoneTargetCount, draftMilestoneNames)
                              )
                            }
                          >
                            {savingMilestoneNamesGoalId === goal.id ? "Saving..." : "Save names"}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {isMilestone ? (
                      <>
                        {editingHistory ? (
                          <p className="text-xs text-muted-foreground">
                            Tap a pending fixed step to mark it complete for today.
                          </p>
                        ) : null}
                        <MilestoneSteps
                          targetCount={milestoneTargetCount}
                          completions={completions}
                          milestoneNames={draftMilestoneNames}
                          interactive={editingHistory}
                          pending={pendingRetroDate === toLocalDateString()}
                          onStepClick={() => {
                            const today = toLocalDateString();
                            const alreadyCompletedToday = completions.some(
                              (completion) => completion.completed_on === today
                            );

                            if (alreadyCompletedToday) {
                              toast("Already completed for today.");
                              return;
                            }

                            void markRetroactiveCompletion(goal, today);
                          }}
                        />
                        {editingHistory && canRenameMilestones ? (
                          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Fixed step names</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {Array.from({ length: milestoneTargetCount }).map((_, index) => (
                                <Input
                                  key={`${goal.id}-milestone-name-${index + 1}`}
                                  value={draftMilestoneNames[index] ?? defaultMilestoneName(index)}
                                  onChange={(event) =>
                                    setMilestoneNameDrafts((previous) => {
                                      const nextGoalNames = [
                                        ...(previous[goal.id] ?? persistedMilestoneNames),
                                      ];
                                      nextGoalNames[index] = event.target.value;
                                      return {
                                        ...previous,
                                        [goal.id]: nextGoalNames,
                                      };
                                    })
                                  }
                                  placeholder={defaultMilestoneName(index)}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {editingHistory ? (
                          <p className="text-xs text-muted-foreground">
                            Tap any day to mark it complete retroactively.
                          </p>
                        ) : null}
                        <MonthHeatmap
                          month={monthCursor}
                          countsByDate={countsByDate}
                          interactive={editingHistory}
                          pendingDate={pendingRetroDate}
                          onDayClick={(date) => void markRetroactiveCompletion(goal, date)}
                        />
                      </>
                    )}

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
          Recurring progress uses completed periods over expected periods unless a target count is set.
        </p>
      </div>
    </div>
  );
}
