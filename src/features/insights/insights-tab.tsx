"use client";

import {
  addYears,
  addMonths,
  differenceInCalendarDays,
  endOfYear,
  format,
  isAfter,
  parseISO,
  startOfDay,
  startOfYear,
  subYears,
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
import { getCategoryBadgeClass } from "@/lib/goals/category";
import { getGoalCompletionPercentage, getOverallCompletionPercentage, getRecurringStreaks } from "@/lib/goals/progress";
import { isGoalCompleted } from "@/lib/goals/schedule";
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

type HeatmapViewMode = "month" | "year";

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
  completionDates: string[];
  milestoneNames?: string[];
}

function MilestoneSteps({ targetCount, completionDates, milestoneNames = [] }: MilestoneStepsProps) {
  const safeTarget = Math.max(targetCount, 1);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Milestones</p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: safeTarget }).map((_, index) => {
          const completionDate = completionDates[index];
          const complete = Boolean(completionDate);
          const milestoneName = milestoneNames[index] ?? defaultMilestoneName(index);

          return (
            <div
              key={`${index + 1}-step`}
              className={`min-w-[110px] rounded-full border px-2.5 py-1 text-[11px] leading-tight ${
                complete
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              <p className="truncate font-medium">{milestoneName}</p>
              <p className={complete ? "text-foreground/75" : "text-muted-foreground"}>
                {complete ? completionDate : "Pending"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getSortedCompletionDates(completions: Completion[]): string[] {
  return Array.from(new Set(completions.map((completion) => completion.completed_on))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function getCompletionCountLabel(goal: Goal, completionCount: number): string {
  if (typeof goal.target_count === "number" && goal.target_count > 0) {
    return `${completionCount}/${goal.target_count} completions`;
  }

  return `${completionCount} completion${completionCount === 1 ? "" : "s"}`;
}

export function InsightsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<InsightsData>(emptyInsights);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [goalMonthOverrides, setGoalMonthOverrides] = useState<Record<string, Date>>({});
  const [perGoalViewMode, setPerGoalViewMode] = useState<HeatmapViewMode>("month");
  const [goalSearchQuery, setGoalSearchQuery] = useState("");
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

  useEffect(() => {
    if (perGoalViewMode === "year" && editingGoalId !== null) {
      setEditingGoalId(null);
    }
  }, [editingGoalId, perGoalViewMode]);

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

  const selectedYearStart = useMemo(() => startOfYear(monthCursor), [monthCursor]);
  const selectedYearEnd = useMemo(() => endOfYear(monthCursor), [monthCursor]);
  const selectedYearEndDate = useMemo(() => format(selectedYearEnd, "yyyy-MM-dd"), [selectedYearEnd]);
  const normalizedGoalSearchQuery = useMemo(
    () => goalSearchQuery.trim().toLowerCase(),
    [goalSearchQuery]
  );
  const searchedPersonalGoals = useMemo(() => {
    if (normalizedGoalSearchQuery.length === 0) {
      return personalGoals;
    }

    return personalGoals.filter((goal) =>
      goal.title.toLowerCase().includes(normalizedGoalSearchQuery)
    );
  }, [normalizedGoalSearchQuery, personalGoals]);
  const prioritizedPersonalGoals = useMemo(() => {
    const today = new Date();
    return [...searchedPersonalGoals].sort((left, right) => {
      const leftCompletionCount = (completionsByGoal.get(left.id) ?? []).length;
      const rightCompletionCount = (completionsByGoal.get(right.id) ?? []).length;
      const leftCompleted = isGoalCompleted(left, today, leftCompletionCount);
      const rightCompleted = isGoalCompleted(right, today, rightCompletionCount);

      if (leftCompleted !== rightCompleted) {
        return leftCompleted ? 1 : -1;
      }

      if (leftCompleted && rightCompleted) {
        if (left.end_date && right.end_date && left.end_date !== right.end_date) {
          return right.end_date.localeCompare(left.end_date);
        }
        if (left.end_date && !right.end_date) {
          return -1;
        }
        if (!left.end_date && right.end_date) {
          return 1;
        }
      }

      return left.title.localeCompare(right.title);
    });
  }, [completionsByGoal, searchedPersonalGoals]);
  const visiblePerGoalHeatmaps = useMemo(() => {
    if (perGoalViewMode === "year") {
      return prioritizedPersonalGoals.filter((goal) => goal.end_date === selectedYearEndDate);
    }

    return prioritizedPersonalGoals;
  }, [perGoalViewMode, prioritizedPersonalGoals, selectedYearEndDate]);

  const overallCompletion = useMemo(
    () => getOverallCompletionPercentage(personalGoals, completionsByGoal),
    [completionsByGoal, personalGoals]
  );

  const toggleMilestoneDateSelection = useCallback(
    async (
      goal: Goal,
      completionDate: string,
      selectedDates: string[],
      milestoneLimit: number
    ) => {
      if (pendingRetroDate !== null) {
        return;
      }

      if (isAfter(parseISO(completionDate), startOfDay(new Date()))) {
        toast.error("You can only select today or past dates.");
        return;
      }

      const isSelected = selectedDates.includes(completionDate);
      if (!isSelected && selectedDates.length >= milestoneLimit) {
        toast.error(`Select up to ${milestoneLimit} milestone dates.`);
        return;
      }

      setPendingRetroDate(completionDate);
      const currentScrollY = window.scrollY;
      try {
        const { error } = await supabase.rpc(
          isSelected ? "unmark_goal_complete" : "mark_goal_complete",
          {
            p_goal_id: goal.id,
            p_date: completionDate,
          }
        );

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success(isSelected ? `Removed ${completionDate}.` : `Selected ${completionDate}.`);
        await loadData({ showLoading: false });
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
      } finally {
        setPendingRetroDate(null);
      }
    },
    [loadData, pendingRetroDate, supabase]
  );

  const toggleRecurringDateSelection = useCallback(
    async (goal: Goal, completionDate: string, hasCompletionOnDate: boolean) => {
      if (pendingRetroDate !== null) {
        return;
      }

      if (isAfter(parseISO(completionDate), startOfDay(new Date()))) {
        toast.error("You can only select today or past dates.");
        return;
      }

      setPendingRetroDate(completionDate);
      const currentScrollY = window.scrollY;
      try {
        const { error } = await supabase.rpc(
          hasCompletionOnDate ? "unmark_goal_complete" : "mark_goal_complete",
          {
            p_goal_id: goal.id,
            p_date: completionDate,
          }
        );

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success(hasCompletionOnDate ? `Removed ${completionDate}.` : `Selected ${completionDate}.`);
        await loadData({ showLoading: false });
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
      } finally {
        setPendingRetroDate(null);
      }
    },
    [loadData, pendingRetroDate, supabase]
  );

  const saveMilestoneNames = useCallback(
    async (goal: Goal, names: string[]) => {
      if (goal.owner_id !== state.userId) {
        toast.error("Only the goal owner can rename milestones.");
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

        toast.success("Milestone names updated.");
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

    setGoalMonthOverrides({});
    setMonthCursor((previous) => (deltaX < 0 ? addMonths(previous, 1) : subMonths(previous, 1)));
  };

  const shiftGlobalMonthCursor = useCallback(
    (direction: -1 | 1) => {
      setGoalMonthOverrides({});
      setMonthCursor((previous) => {
        if (perGoalViewMode === "month") {
          return direction > 0 ? addMonths(previous, 1) : subMonths(previous, 1);
        }
        return direction > 0 ? addYears(previous, 1) : subYears(previous, 1);
      });
    },
    [perGoalViewMode]
  );

  const shiftGoalMonthCursor = useCallback(
    (goalId: string, direction: -1 | 1) => {
      setGoalMonthOverrides((previous) => {
        const baselineMonth = previous[goalId] ?? monthCursor;
        const nextMonth = direction > 0 ? addMonths(baselineMonth, 1) : subMonths(baselineMonth, 1);
        return {
          ...previous,
          [goalId]: nextMonth,
        };
      });
    },
    [monthCursor]
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
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-primary" />
            <CardTitle>Per-goal controls</CardTitle>
          </div>
          <CardDescription>Switch between monthly and yearly goal heatmaps.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-lg border bg-muted/20 p-1">
              <Button
                type="button"
                size="sm"
                variant={perGoalViewMode === "month" ? "secondary" : "ghost"}
                onClick={() => {
                  setGoalMonthOverrides({});
                  setPerGoalViewMode("month");
                }}
              >
                Month
              </Button>
              <Button
                type="button"
                size="sm"
                variant={perGoalViewMode === "year" ? "secondary" : "ghost"}
                onClick={() => {
                  setGoalMonthOverrides({});
                  setPerGoalViewMode("year");
                }}
              >
                Year
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => shiftGlobalMonthCursor(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[120px] text-center text-sm font-medium text-muted-foreground">
                {perGoalViewMode === "month" ? format(monthCursor, "MMMM yyyy") : format(monthCursor, "yyyy")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => shiftGlobalMonthCursor(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <Input
            value={goalSearchQuery}
            onChange={(event) => setGoalSearchQuery(event.target.value)}
            placeholder="Search goals..."
            className="h-8"
          />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <div>
            <CardTitle>
              {perGoalViewMode === "month" ? "Per-goal monthly heatmaps" : "Per-goal yearly heatmaps"}
            </CardTitle>
            <CardDescription>
              {perGoalViewMode === "month"
                ? "Navigate by month to inspect each goal pattern."
                : "Yearly consistency view per goal."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent
          className="space-y-3"
          data-no-swipe="true"
          onTouchStart={perGoalViewMode === "month" ? onMonthSectionTouchStart : undefined}
          onTouchEnd={perGoalViewMode === "month" ? onMonthSectionTouchEnd : undefined}
        >
          {visiblePerGoalHeatmaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {perGoalViewMode === "year"
                ? `No year-end resolutions for ${format(monthCursor, "yyyy")}.`
                : "No goals available yet."}
            </p>
          ) : (
            visiblePerGoalHeatmaps.map((goal) => {
              const goalMonthCursor = goalMonthOverrides[goal.id] ?? monthCursor;
              const completions = completionsByGoal.get(goal.id) ?? [];
              const completionCount = completions.length;
              const hasTargetCount = typeof goal.target_count === "number" && goal.target_count > 0;
              const completionCountLabel = getCompletionCountLabel(goal, completionCount);
              const countsByDate = goalCompletionCountsByDate(completions);
              const percent = hasTargetCount ? getGoalCompletionPercentage(goal, completions) : 0;
              const streaks = getRecurringStreaks(goal, completions);
              const daysRemaining =
                goal.end_date !== null
                  ? Math.max(
                      differenceInCalendarDays(parseISO(goal.end_date), startOfDay(new Date())),
                      0
                    )
                  : null;
              const isRecurring = goal.frequency_type === "recurring";
              const isMilestone = goal.frequency_type === "fixed_milestones";
              const canEditHistory = (isRecurring || isMilestone) && perGoalViewMode === "month";
              const editingHistory = editingGoalId === goal.id;
              const milestoneTargetCount = Math.max(goal.target_count ?? completionCount, 1);
              const milestoneCompletionDates = getSortedCompletionDates(completions);
              const mappedMilestoneDates = milestoneCompletionDates.slice(0, milestoneTargetCount);
              const goalHeatmapData = Object.entries(countsByDate).map(([date, count]) => ({
                date,
                count,
              }));
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
                        <Badge variant="secondary">
                          {hasTargetCount ? `${Math.round(percent)}%` : completionCountLabel}
                        </Badge>
                        {canEditHistory ? (
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
                                : "Edit milestones"}
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
                        <MilestoneSteps
                          targetCount={milestoneTargetCount}
                          completionDates={mappedMilestoneDates}
                          milestoneNames={draftMilestoneNames}
                        />
                        {editingHistory && perGoalViewMode === "month" ? (
                          <p className="text-xs text-muted-foreground">
                            Tap calendar dates to assign milestones. Earliest selected date maps to
                            milestone 1. You can select up to {milestoneTargetCount} date
                            {milestoneTargetCount === 1 ? "" : "s"}.
                          </p>
                        ) : null}
                        {perGoalViewMode === "month" ? (
                          <MonthHeatmap
                            month={goalMonthCursor}
                            countsByDate={countsByDate}
                            interactive={editingHistory}
                            pendingDate={pendingRetroDate}
                            onPreviousMonth={() => shiftGoalMonthCursor(goal.id, -1)}
                            onNextMonth={() => shiftGoalMonthCursor(goal.id, 1)}
                            onDayClick={(date) =>
                              void toggleMilestoneDateSelection(
                                goal,
                                date,
                                milestoneCompletionDates,
                                milestoneTargetCount
                              )
                            }
                          />
                        ) : (
                          <div className="overflow-x-auto rounded-xl border bg-card p-3">
                            <CalendarHeatmap
                              startDate={selectedYearStart}
                              endDate={selectedYearEnd}
                              values={goalHeatmapData}
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
                        )}
                        {editingHistory && canRenameMilestones ? (
                          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Milestone names</p>
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
                        {editingHistory && perGoalViewMode === "month" ? (
                          <p className="text-xs text-muted-foreground">
                            Tap any day to toggle completion retroactively.
                          </p>
                        ) : null}
                        {perGoalViewMode === "month" ? (
                          <MonthHeatmap
                            month={goalMonthCursor}
                            countsByDate={countsByDate}
                            interactive={editingHistory}
                            pendingDate={pendingRetroDate}
                            onPreviousMonth={() => shiftGoalMonthCursor(goal.id, -1)}
                            onNextMonth={() => shiftGoalMonthCursor(goal.id, 1)}
                            onDayClick={(date) =>
                              void toggleRecurringDateSelection(
                                goal,
                                date,
                                (countsByDate[date] ?? 0) > 0
                              )
                            }
                          />
                        ) : (
                          <div className="overflow-x-auto rounded-xl border bg-card p-3">
                            <CalendarHeatmap
                              startDate={selectedYearStart}
                              endDate={selectedYearEnd}
                              values={goalHeatmapData}
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
                        )}
                      </>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="size-3" />
                          Completion
                        </span>
                        <span className="text-right">
                          {hasTargetCount ? `${Math.round(percent)}% · ${completionCountLabel}` : completionCountLabel}
                        </span>
                      </div>
                      {hasTargetCount ? <Progress value={percent} /> : null}
                    </div>

                    {goal.frequency_type === "recurring" || daysRemaining !== null ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {goal.frequency_type === "recurring" ? (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <Flame className="size-3" />
                              Current streak: {streaks.current}
                            </span>
                            <span>Longest streak: {streaks.longest}</span>
                          </>
                        ) : null}
                        {daysRemaining !== null ? <span>Days remaining: {daysRemaining}</span> : null}
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
