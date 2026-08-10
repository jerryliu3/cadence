"use client";

import {
  addYears,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfYear,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subYears,
  subMonths,
} from "date-fns";
import {
  CalendarRange,
  Flame,
  Layers3,
  PencilLine,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type TouchEventHandler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingCard } from "@/components/ui/loading-card";
import { PeriodStepper } from "@/components/ui/period-stepper";
import { Progress } from "@/components/ui/progress";
import { buildLoginHref } from "@/lib/auth/login-redirect";
import { GoalEndMonthBadge } from "@/features/goals/goal-end-month-badge";
import { MilestonePills } from "@/features/goals/milestone-pills";
import { GoalListControls } from "@/features/goals/goal-list-controls";
import { MonthHeatmap } from "@/features/insights/month-heatmap";
import { getApiErrorMessage } from "@/lib/api/client";
import { isAbortError, withAbortSignal } from "@/lib/async/abort";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import { getCategoryBadgeClass } from "@/lib/goals/category";
import {
  countCompletionsByDate,
  getSortedCompletionDates,
  groupCompletionsByGoalId,
} from "@/lib/goals/completion-grouping";
import {
  buildCompletableGoalIds,
  filterCompletionsForGoalIds,
  selectCompletableGoals,
} from "@/lib/goals/completable-goals";
import { resolveSelectedDateState, toLocalDateString } from "@/lib/dates/day";
import {
  filterGoalsByEndMonth,
  partitionGoalsByVisibleStart,
  resolveEffectiveEndMonth,
  sortGoalsByDate,
  type GoalDateSort,
} from "@/lib/goals/list-view";
import {
  areMilestoneNamesEqual,
  buildMilestoneNames,
  defaultMilestoneName,
} from "@/lib/goals/milestones";
import { getHeatmapScaleClass } from "@/lib/goals/heatmap";
import {
  fetchProgressContext,
  progressSummaryMap,
  type ProgressContextResponse,
} from "@/lib/goals/progress-context";
import type {
  CompletionDateFact,
  Goal,
  GoalParticipant,
} from "@/lib/goals/types";
import {
  resolveCompletionDispatch,
} from "@/lib/planner/completion-dispatch";
import {
  getGoalRequirement,
  isTargetedRecurringGoal,
} from "@/lib/planner/requirements";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";
import { createClient } from "@/lib/supabase/client";

interface InsightsData {
  userId: string;
  goals: Goal[];
  completions: CompletionDateFact[];
  participants: GoalParticipant[];
  progress: ProgressContextResponse | null;
}

const emptyInsights: InsightsData = {
  userId: "",
  goals: [],
  completions: [],
  participants: [],
  progress: null,
};

type HeatmapViewMode = "month" | "year";

const aggregateWeekdayLabels: [string, string, string, string, string, string, string] = [
  "Su",
  "M",
  "T",
  "W",
  "Th",
  "F",
  "S",
];
const INSIGHTS_REQUEST_TIMEOUT_MS = 15_000;
const MAX_VISIBLE_MILESTONES = 5;

function isAuthenticationLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("authentication") ||
    normalized.includes("unauthorized") ||
    normalized.includes("sign in")
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
  const router = useRouter();
  const [state, setState] = useState<InsightsData>(emptyInsights);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [goalMonthOverrides, setGoalMonthOverrides] = useState<Record<string, Date>>({});
  const [perGoalViewMode, setPerGoalViewMode] = useState<HeatmapViewMode>("month");
  const [goalSearchQuery, setGoalSearchQuery] = useState("");
  const [goalEndMonth, setGoalEndMonth] = useState<string | null>(null);
  const [goalSort, setGoalSort] = useState<GoalDateSort>("earliest_end");
  const [showHistoricalGoals, setShowHistoricalGoals] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [pendingRetroDate, setPendingRetroDate] = useState<string | null>(null);
  const [milestoneNameDrafts, setMilestoneNameDrafts] = useState<Record<string, string[]>>({});
  const [savingMilestoneNamesGoalId, setSavingMilestoneNamesGoalId] = useState<string | null>(
    null
  );
  const monthSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const loadRequestIdRef = useRef(0);
  const visibleLoadCountRef = useRef(0);
  const authRedirectStartedRef = useRef(false);
  const runCompletionMutation = useCompletionMutation();
  const selectedYear = useMemo(() => format(monthCursor, "yyyy"), [monthCursor]);

  const redirectToLogin = useCallback(() => {
    if (authRedirectStartedRef.current) {
      return;
    }
    authRedirectStartedRef.current = true;
    const nextPath =
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}`;
    router.replace(buildLoginHref(nextPath));
  }, [router]);

  const loadData = useCallback(
    async (
      {
        showLoading = true,
        forceRefresh = false,
      }: { showLoading?: boolean; forceRefresh?: boolean } = {}
    ) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      if (showLoading) {
        visibleLoadCountRef.current += 1;
        setLoading(true);
      }
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        INSIGHTS_REQUEST_TIMEOUT_MS
      );
      try {
        const {
          data: { user },
          error: userError,
        } = await withAbortSignal(supabase.auth.getUser(), controller.signal);

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        if (userError || !user) {
          setState(emptyInsights);
          redirectToLogin();
          return;
        }

        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;
        // Heatmap facts are intentionally year-bounded. A per-year client cache
        // is optional later if measured navigation latency warrants it.
        const [goalsResponse, participantsResponse, progress] =
          await withAbortSignal(
            Promise.all([
              supabase.from("goals").select("*").eq("is_deleted", false).order("title"),
              supabase.from("goal_participants").select("*").eq("user_id", user.id),
              fetchProgressContext({
                asOfDate: toLocalDateString(),
                factsFrom: yearStart,
                factsTo: yearEnd,
                forceRefresh,
              }),
            ]),
            controller.signal
          );

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        setState({
          userId: user.id,
          goals: (goalsResponse.data ?? []) as Goal[],
          completions: progress.facts,
          participants: (participantsResponse.data ?? []) as GoalParticipant[],
          progress,
        });
      } finally {
        window.clearTimeout(timeoutId);
        if (showLoading) {
          visibleLoadCountRef.current = Math.max(visibleLoadCountRef.current - 1, 0);
          if (visibleLoadCountRef.current === 0) {
            setLoading(false);
          }
        }
      }
    },
    [redirectToLogin, selectedYear, supabase]
  );

  useEffect(() => {
    const run = async () => {
      try {
        await loadData();
      } catch (error) {
        if (isAuthenticationLikeError(error)) {
          redirectToLogin();
          return;
        }
        toast.error(
          isAbortError(error)
            ? "Insights request timed out. Please try again."
            : error instanceof Error
              ? error.message
              : "Insights progress could not be loaded."
        );
      }
    };

    void run();
  }, [loadData, redirectToLogin]);

  const completableGoalIds = useMemo(
    () =>
      buildCompletableGoalIds({
        goals: state.goals,
        participants: state.participants,
        userId: state.userId,
        restrictParticipantsToVisibleGoals: true,
      }),
    [state.goals, state.participants, state.userId]
  );

  const personalGoals = useMemo(
    () => selectCompletableGoals(state.goals, completableGoalIds),
    [completableGoalIds, state.goals]
  );

  const personalCompletions = useMemo(
    () => filterCompletionsForGoalIds(state.completions, completableGoalIds),
    [completableGoalIds, state.completions]
  );

  const completionsByGoal = useMemo(
    () => groupCompletionsByGoalId(personalCompletions),
    [personalCompletions]
  );
  const progressByGoal = useMemo(
    () => progressSummaryMap(state.progress),
    [state.progress]
  );

  const aggregateCountsByDate = useMemo(
    () => countCompletionsByDate(personalCompletions),
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
  const visiblePeriodStart = useMemo(
    () =>
      format(
        perGoalViewMode === "month" ? startOfMonth(monthCursor) : startOfYear(monthCursor),
        "yyyy-MM-dd"
      ),
    [monthCursor, perGoalViewMode]
  );
  const goalFilterStartMonth = visiblePeriodStart.slice(0, 7);
  const effectiveGoalEndMonth = resolveEffectiveEndMonth(
    goalEndMonth,
    goalFilterStartMonth
  );
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
  const filteredPersonalGoals = useMemo(
    () => filterGoalsByEndMonth(searchedPersonalGoals, effectiveGoalEndMonth),
    [effectiveGoalEndMonth, searchedPersonalGoals]
  );
  const goalsByVisiblePeriod = useMemo(
    () => partitionGoalsByVisibleStart(filteredPersonalGoals, visiblePeriodStart),
    [filteredPersonalGoals, visiblePeriodStart]
  );
  const currentPeriodGoals = goalsByVisiblePeriod.current;
  const historicalGoals = goalsByVisiblePeriod.historical;
  const visiblePerGoalHeatmaps = useMemo(() => {
    const currentGoals = sortGoalsByDate(currentPeriodGoals, goalSort);
    if (!showHistoricalGoals) {
      return currentGoals;
    }

    return [
      ...currentGoals,
      ...sortGoalsByDate(historicalGoals, goalSort),
    ];
  }, [currentPeriodGoals, goalSort, historicalGoals, showHistoricalGoals]);

  const overallCompletion = useMemo(() => {
    if (personalGoals.length === 0) {
      return 0;
    }
    return (
      personalGoals.reduce(
        (total, goal) => total + (progressByGoal.get(goal.id)?.percent ?? 0),
        0
      ) / personalGoals.length
    );
  }, [personalGoals, progressByGoal]);

  const toggleMilestoneDateSelection = useCallback(
    async (
      goal: Goal,
      completionDate: string,
      selectedDates: string[],
      milestoneLimit: number,
      creditedCount: number
    ) => {
      if (pendingRetroDate !== null) {
        return;
      }

      const isSelected = selectedDates.includes(completionDate);
      const localToday = toLocalDateString();
      if (completionDate > localToday && !isSelected) {
        toast.error("You can only select today or past dates.");
        return;
      }

      if (!isSelected && creditedCount >= milestoneLimit) {
        toast.error(`Select up to ${milestoneLimit} milestone dates.`);
        return;
      }

      setPendingRetroDate(completionDate);
      const currentScrollY = window.scrollY;
      const desiredFactState = isSelected ? "absent" : "present";
      const requirement = getGoalRequirement(goal);
      const decision = resolveCompletionDispatch({
        requirementKind: requirement.kind,
        targetedRecurring: isTargetedRecurringGoal(goal),
        activePlanMembership: false,
        matchingItemState: "none",
        selectedDateState: resolveSelectedDateState(completionDate, localToday),
        existingExactFact: isSelected,
        desiredFactState,
      });

      const result = await runCompletionMutation({
        decision,
        desiredFactState,
        goalId: goal.id,
        date: completionDate,
        timezone: resolveUserTimezone(),
        blockedMessage:
          decision.reason === "future_creation"
            ? "You can only select today or past dates."
            : "This completion cannot be changed from this date.",
        fallbackErrorMessage: "Completion update failed.",
      });

      if (!result.ok) {
        toast.error(result.message ?? "Completion update failed.");
        setPendingRetroDate(null);
        return;
      }

      toast.success(isSelected ? `Removed ${completionDate}.` : `Selected ${completionDate}.`);
      try {
        await loadData({ showLoading: false, forceRefresh: true });
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
      } catch (error) {
        if (isAuthenticationLikeError(error)) {
          redirectToLogin();
          return;
        }
        const timeoutLike =
          error instanceof Error &&
          error.message.toLowerCase().includes("timed out");
        toast.error(
          timeoutLike
            ? "Completion updated, but calendar refresh timed out. Please refresh the page."
            : "Completion updated, but calendar refresh failed. Please refresh the page."
        );
      } finally {
        setPendingRetroDate(null);
      }
    },
    [loadData, pendingRetroDate, redirectToLogin, runCompletionMutation]
  );

  const toggleRecurringDateSelection = useCallback(
    async (goal: Goal, completionDate: string, hasCompletionOnDate: boolean) => {
      if (pendingRetroDate !== null) {
        return;
      }

      const localToday = toLocalDateString();
      if (completionDate > localToday && !hasCompletionOnDate) {
        toast.error("You can only select today or past dates.");
        return;
      }

      setPendingRetroDate(completionDate);
      const currentScrollY = window.scrollY;
      const desiredFactState = hasCompletionOnDate ? "absent" : "present";
      const requirement = getGoalRequirement(goal);
      const decision = resolveCompletionDispatch({
        requirementKind: requirement.kind,
        targetedRecurring: isTargetedRecurringGoal(goal),
        activePlanMembership: false,
        matchingItemState: "none",
        selectedDateState: resolveSelectedDateState(completionDate, localToday),
        existingExactFact: hasCompletionOnDate,
        desiredFactState,
      });

      const result = await runCompletionMutation({
        decision,
        desiredFactState,
        goalId: goal.id,
        date: completionDate,
        timezone: resolveUserTimezone(),
        blockedMessage:
          decision.reason === "future_creation"
            ? "You can only select today or past dates."
            : "This completion cannot be changed from this date.",
        fallbackErrorMessage: "Completion update failed.",
      });

      if (!result.ok) {
        toast.error(result.message ?? "Completion update failed.");
        setPendingRetroDate(null);
        return;
      }

      toast.success(hasCompletionOnDate ? `Removed ${completionDate}.` : `Selected ${completionDate}.`);
      try {
        await loadData({ showLoading: false, forceRefresh: true });
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
      } catch (error) {
        if (isAuthenticationLikeError(error)) {
          redirectToLogin();
          return;
        }
        const timeoutLike =
          error instanceof Error &&
          error.message.toLowerCase().includes("timed out");
        toast.error(
          timeoutLike
            ? "Completion updated, but calendar refresh timed out. Please refresh the page."
            : "Completion updated, but calendar refresh failed. Please refresh the page."
        );
      } finally {
        setPendingRetroDate(null);
      }
    },
    [loadData, pendingRetroDate, redirectToLogin, runCompletionMutation]
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
        await withPlannerRefreshTimeout({
          operation: loadData({ showLoading: false, forceRefresh: true }),
          timeoutMessage: "Insights refresh timed out. Please refresh to sync.",
        });
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
      } catch (error) {
        if (isAuthenticationLikeError(error)) {
          redirectToLogin();
          return;
        }
        toast.error(
          getApiErrorMessage(error, "Milestone names update failed.")
        );
      } finally {
        setSavingMilestoneNamesGoalId(null);
      }
    },
    [loadData, redirectToLogin, state.userId, supabase]
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
      const baselineMonth = goalMonthOverrides[goalId] ?? monthCursor;
      const nextMonth =
        direction > 0
          ? addMonths(baselineMonth, 1)
          : subMonths(baselineMonth, 1);

      if (nextMonth.getFullYear() !== monthCursor.getFullYear()) {
        setGoalMonthOverrides({});
        setMonthCursor(nextMonth);
        return;
      }

      setGoalMonthOverrides((previous) => ({
        ...previous,
        [goalId]: nextMonth,
      }));
    },
    [goalMonthOverrides, monthCursor]
  );

  if (loading) {
    return (
      <LoadingCard
        title="Loading insights..."
        description="Crunching your completion history."
      />
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
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border bg-card p-4">
            <CalendarHeatmap
              startDate={selectedYearStart}
              endDate={selectedYearEnd}
              values={aggregateHeatmapData}
              showWeekdayLabels
              weekdayLabels={aggregateWeekdayLabels}
              classForValue={(value) => getHeatmapScaleClass(value?.count ?? 0)}
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
            <span className="text-muted-foreground">Overall completion</span>
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
            <div
              className="inline-flex items-center rounded-lg border bg-muted/20 p-1"
              role="group"
              aria-label="Heatmap view"
            >
              <Button
                type="button"
                size="sm"
                variant={perGoalViewMode === "month" ? "secondary" : "ghost"}
                aria-pressed={perGoalViewMode === "month"}
                onClick={() => {
                  setGoalMonthOverrides({});
                  setPerGoalViewMode("month");
                }}
              >
                Month View
              </Button>
              <Button
                type="button"
                size="sm"
                variant={perGoalViewMode === "year" ? "secondary" : "ghost"}
                aria-pressed={perGoalViewMode === "year"}
                onClick={() => {
                  setGoalMonthOverrides({});
                  setPerGoalViewMode("year");
                }}
              >
                Year View
              </Button>
            </div>
            <PeriodStepper
              onPrevious={() => shiftGlobalMonthCursor(-1)}
              onNext={() => shiftGlobalMonthCursor(1)}
              center={
                <span className="min-w-[120px] text-center text-sm font-medium text-muted-foreground">
                  {perGoalViewMode === "month"
                    ? format(monthCursor, "MMMM yyyy")
                    : format(monthCursor, "yyyy")}
                </span>
              }
              previousAriaLabel="Previous period"
              nextAriaLabel="Next period"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <GoalListControls
              goals={personalGoals}
              referenceMonth={goalFilterStartMonth}
              endMonth={effectiveGoalEndMonth}
              onEndMonthChange={setGoalEndMonth}
              sort={goalSort}
              onSortChange={setGoalSort}
            />
            <label
              className={`flex h-8 w-fit items-center gap-2 text-xs text-muted-foreground ${
                historicalGoals.length === 0 ? "opacity-60" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={showHistoricalGoals}
                disabled={historicalGoals.length === 0}
                onChange={(event) => setShowHistoricalGoals(event.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              Show ended goals
              <span>({historicalGoals.length})</span>
            </label>
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
            <p className="text-sm text-muted-foreground">No goals match these controls.</p>
          ) : (
            visiblePerGoalHeatmaps.map((goal) => {
              const goalMonthCursor = goalMonthOverrides[goal.id] ?? monthCursor;
              const completions = completionsByGoal.get(goal.id) ?? [];
              const progress = progressByGoal.get(goal.id);
              const completionCount =
                progress?.admissibleCompletionCount ?? 0;
              const hasTargetCount = typeof goal.target_count === "number" && goal.target_count > 0;
              const completionCountLabel = getCompletionCountLabel(goal, completionCount);
              const countsByDate = countCompletionsByDate(completions);
              const percent = progress?.percent ?? 0;
              const streaks = {
                current: progress?.currentStreak ?? 0,
                longest: progress?.longestStreak ?? 0,
              };
              const daysRemaining =
                goal.end_date !== null
                  ? Math.max(
                      differenceInCalendarDays(parseISO(goal.end_date), startOfDay(new Date())),
                      0
                    )
                  : null;
              const isRecurring = goal.frequency_type === "recurring";
              const targetedRecurring = isTargetedRecurringGoal(goal);
              const isMilestone = goal.frequency_type === "fixed_milestones";
              const canEditHistory = isRecurring || isMilestone;
              const editingHistory = editingGoalId === goal.id;
              const milestoneTargetCount = Math.max(goal.target_count ?? completionCount, 1);
              const milestoneCompletionDates = getSortedCompletionDates(completions);
              const mappedMilestoneDates =
                progress?.milestoneDates ??
                milestoneCompletionDates.slice(0, milestoneTargetCount);
              const goalHeatmapData = eachDayOfInterval({
                start: selectedYearStart,
                end: selectedYearEnd,
              }).map((date) => {
                const key = format(date, "yyyy-MM-dd");
                return {
                  date: key,
                  count: countsByDate[key] ?? 0,
                };
              });
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
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex min-w-0 items-start gap-2">
                          <span
                            className="mt-1 size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: goal.color ?? "var(--muted-foreground)" }}
                          />
                          <p className="text-sm font-semibold leading-tight break-words [overflow-wrap:anywhere]">
                            {goal.title}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={`w-fit ${getCategoryBadgeClass(goal.category)}`}
                          >
                            {goal.category}
                          </Badge>
                          <GoalEndMonthBadge endDate={goal.end_date} />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
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
                        <MilestonePills
                          targetCount={milestoneTargetCount}
                          completionDates={mappedMilestoneDates}
                          milestoneNames={draftMilestoneNames}
                          maxVisible={MAX_VISIBLE_MILESTONES}
                        />
                        {editingHistory ? (
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
                                milestoneTargetCount,
                                progress?.creditedUnitCount ?? 0
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
                              classForValue={(value) =>
                                `${getHeatmapScaleClass(value?.count ?? 0)}${
                                  editingHistory ? " cursor-pointer" : ""
                                }`
                              }
                              titleForValue={(value) =>
                                `${value?.date ?? "N/A"}: ${value?.count ?? 0} completion${
                                  (value?.count ?? 0) === 1 ? "" : "s"
                                }`
                              }
                              onClick={(value) => {
                                const selectedDate = value?.date;
                                if (!editingHistory || !selectedDate) {
                                  return;
                                }

                                void toggleMilestoneDateSelection(
                                  goal,
                                  selectedDate,
                                  milestoneCompletionDates,
                                  milestoneTargetCount,
                                  progress?.creditedUnitCount ?? 0
                                );
                              }}
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
                        {editingHistory ? (
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
                              classForValue={(value) =>
                                `${getHeatmapScaleClass(value?.count ?? 0)}${
                                  editingHistory ? " cursor-pointer" : ""
                                }`
                              }
                              titleForValue={(value) =>
                                `${value?.date ?? "N/A"}: ${value?.count ?? 0} completion${
                                  (value?.count ?? 0) === 1 ? "" : "s"
                                }`
                              }
                              onClick={(value) => {
                                const selectedDate = value?.date;
                                if (!editingHistory || !selectedDate) {
                                  return;
                                }

                                void toggleRecurringDateSelection(
                                  goal,
                                  selectedDate,
                                  (countsByDate[selectedDate] ?? 0) > 0
                                );
                              }}
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

                    {(goal.frequency_type === "recurring" && !targetedRecurring) ||
                    daysRemaining !== null ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {goal.frequency_type === "recurring" && !targetedRecurring ? (
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
          Cadence goals use completed anchored periods. Goals with a target
          count use exact-date completions toward the deadline total and do not
          use streaks.
        </p>
      </div>
    </div>
  );
}
