"use client";

import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfYear,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import {
  CalendarRange,
  Flame,
  Maximize2,
  PencilLine,
  TrendingUp,
  X,
} from "lucide-react";
import { type TouchEventHandler, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AnchoredPopupCard } from "@/components/ui/anchored-popup-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingCard } from "@/components/ui/loading-card";
import { Progress } from "@/components/ui/progress";
import {
  InsightsPeriodControls,
  InsightsPeriodStepper,
} from "@/features/insights/insights-period-controls";
import { GoalEndMonthBadge } from "@/features/goals/goal-end-month-badge";
import { MilestonePills } from "@/features/goals/milestone-pills";
import { GoalListControls } from "@/features/goals/goal-list-controls";
import { InsightsOverallStatsCard } from "@/features/insights/insights-overall-stats-card";
import {
  selectOverallCompletionPercent,
  selectSearchedGoals,
  selectVisiblePerGoalHeatmaps,
  selectYearHeatmapValues,
} from "@/features/insights/insights-selectors";
import { MonthHeatmap } from "@/features/insights/month-heatmap";
import { useInsightsData } from "@/features/insights/use-insights-data";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import { CalendarDayPreviewList } from "@/features/planner/calendar-day-preview-list";
import { computeDayPreviewPosition } from "@/features/planner/day-preview-popup";
import { getApiErrorMessage } from "@/lib/api/client";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import {
  getCategoryBadgeClass,
  getGoalCategoryLabel,
} from "@/lib/goals/category";
import {
  countCompletionsByDate,
  groupCompletionTitlesByDate,
  getSortedCompletionDates,
  groupCompletionsByGoalId,
} from "@/lib/goals/completion-grouping";
import {
  buildCompletableGoalIds,
  filterCompletionsForGoalIds,
  selectCompletableGoals,
} from "@cadence/shared/goals/completable-goals";
import { resolveSelectedDateState, toLocalDateString } from "@/lib/dates/day";
import {
  resolveEffectiveEndMonth,
  type GoalDateSort,
} from "@/lib/goals/list-view";
import {
  areMilestoneNamesEqual,
  buildMilestoneNames,
  defaultMilestoneName,
} from "@/lib/goals/milestones";
import { getHeatmapScaleClass } from "@/lib/goals/heatmap";
import {
  isProgressContextAuthenticationError,
  progressSummaryMap,
} from "@/lib/goals/progress-context";
import type { Goal } from "@/lib/goals/types";
import {
  resolveCompletionDispatch,
} from "@/lib/planner/completion-dispatch";
import {
  getGoalRequirement,
  isTargetedRecurringGoal,
} from "@/lib/planner/requirements";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";
import { useOutsidePointerDismiss } from "@/lib/ui/use-outside-pointer-dismiss";
import { captureViewportRect } from "@/lib/xp/events";
import { createClient } from "@/lib/supabase/client";

export type HeatmapViewMode = "month" | "year";

const MAX_VISIBLE_MILESTONES = 5;
const AGGREGATE_DRILLDOWN_DAY_CLASS_PREFIX = "aggregate-drilldown-day-";
const aggregateWeekdayLabels: [string, string, string, string, string, string, string] = [
  "Su",
  "M",
  "T",
  "W",
  "Th",
  "F",
  "S",
];

function getAggregateDrilldownDayClass(date: string | null | undefined): string {
  return date ? `${AGGREGATE_DRILLDOWN_DAY_CLASS_PREFIX}${date}` : "";
}

function getCompletionCountLabel(goal: Goal, completionCount: number): string {
  if (typeof goal.target_count === "number" && goal.target_count > 0) {
    return `${completionCount}/${goal.target_count} completions`;
  }

  return `${completionCount} completion${completionCount === 1 ? "" : "s"}`;
}

interface AggregateDrilldownCompletionMarker {
  key: string;
  goalTitle: string;
  scheduledDate: string | null;
}

interface InsightsTabProps {
  subjectUserId?: string;
  readOnly?: boolean;
  /**
   * Supplied only when the lanes share one period cursor (duo `both` scope).
   * Presence means "the shell owns and renders the controls", so there is no
   * separate flag that can contradict the handlers.
   */
  sharedPeriod?: {
    monthCursor: Date;
    onMonthCursorChange: (next: Date) => void;
    perGoalViewMode: HeatmapViewMode;
    onPerGoalViewModeChange: (mode: HeatmapViewMode) => void;
  };
}

export function InsightsTab({
  subjectUserId,
  readOnly = false,
  sharedPeriod,
}: InsightsTabProps = {}) {
  const [internalMonthCursor, setInternalMonthCursor] = useState(new Date());
  const [internalPerGoalViewMode, setInternalPerGoalViewMode] =
    useState<HeatmapViewMode>("month");
  const monthCursor = sharedPeriod?.monthCursor ?? internalMonthCursor;
  const setMonthCursor = useCallback(
    (next: Date | ((previous: Date) => Date)) => {
      if (sharedPeriod) {
        sharedPeriod.onMonthCursorChange(
          typeof next === "function" ? next(monthCursor) : next
        );
        return;
      }
      setInternalMonthCursor(next);
    },
    [monthCursor, sharedPeriod]
  );
  const perGoalViewMode = sharedPeriod?.perGoalViewMode ?? internalPerGoalViewMode;
  const setPerGoalViewMode =
    sharedPeriod?.onPerGoalViewModeChange ?? setInternalPerGoalViewMode;
  const [goalMonthOverrides, setGoalMonthOverrides] = useState<Record<string, Date>>({});
  const [goalSearchQuery, setGoalSearchQuery] = useState("");
  const [goalEndMonth, setGoalEndMonth] = useState<string | null>(null);
  const [goalSort, setGoalSort] = useState<GoalDateSort>("earliest_end");
  const [showHistoricalGoals, setShowHistoricalGoals] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [aggregateDrilldownDate, setAggregateDrilldownDate] = useState<string | null>(null);
  const [aggregateDrilldownExpanded, setAggregateDrilldownExpanded] = useState(false);
  const [aggregateDrilldownPosition, setAggregateDrilldownPosition] = useState<
    ReturnType<typeof computeDayPreviewPosition> | null
  >(null);
  const [pendingRetroDate, setPendingRetroDate] = useState<string | null>(null);
  const [milestoneNameDrafts, setMilestoneNameDrafts] = useState<Record<string, string[]>>({});
  const [savingMilestoneNamesGoalId, setSavingMilestoneNamesGoalId] = useState<string | null>(
    null
  );
  const monthSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const aggregateHeatmapRef = useRef<HTMLDivElement | null>(null);
  const aggregateDrilldownRef = useRef<HTMLDivElement | null>(null);
  const runCompletionMutation = useCompletionMutation();
  const selectedYear = useMemo(() => format(monthCursor, "yyyy"), [monthCursor]);
  const { state, loading, laneError, loadData, redirectToLogin } = useInsightsData({
    subjectUserId,
    selectedYear,
    failClosed: Boolean(readOnly && subjectUserId),
  });
  const supabase = useMemo(() => createClient(), []);

  // Switching month/year invalidates per-goal cursors. React's sanctioned form
  // for "reset state when a prop changes" is a render-phase adjustment, not an
  // effect -- an effect here cascades an extra render on every switch.
  const [overridesViewMode, setOverridesViewMode] = useState(perGoalViewMode);
  if (overridesViewMode !== perGoalViewMode) {
    setOverridesViewMode(perGoalViewMode);
    setGoalMonthOverrides({});
  }

  const completableGoalIds = useMemo(
    () =>
      buildCompletableGoalIds({
        goals: state.goals,
        userId: state.userId,
        memberTeamIds: state.memberTeamIds,
      }),
    [state.goals, state.memberTeamIds, state.userId]
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
  const goalTitleById = useMemo(
    () =>
      new Map(
        personalGoals.map((goal) => [goal.id, goal.title])
      ),
    [personalGoals]
  );
  const aggregateCompletionItemsByDate = useMemo(
    () => groupCompletionTitlesByDate(personalCompletions, goalTitleById),
    [goalTitleById, personalCompletions]
  );

  const aggregateHeatmapData = useMemo(
    () => selectYearHeatmapValues(monthCursor, aggregateCountsByDate),
    [aggregateCountsByDate, monthCursor]
  );

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
  const searchedPersonalGoals = useMemo(
    () => selectSearchedGoals(personalGoals, goalSearchQuery),
    [goalSearchQuery, personalGoals]
  );
  const { historicalGoals, visiblePerGoalHeatmaps } = useMemo(
    () =>
      selectVisiblePerGoalHeatmaps({
        goals: searchedPersonalGoals,
        visiblePeriodStart,
        endMonth: effectiveGoalEndMonth,
        showHistoricalGoals,
        sort: goalSort,
      }),
    [
      effectiveGoalEndMonth,
      goalSort,
      searchedPersonalGoals,
      showHistoricalGoals,
      visiblePeriodStart,
    ]
  );

  const overallCompletion = useMemo(
    () => selectOverallCompletionPercent(personalGoals, progressByGoal),
    [personalGoals, progressByGoal]
  );

  const toggleMilestoneDateSelection = useCallback(
    async (
      goal: Goal,
      completionDate: string,
      selectedDates: string[],
      milestoneLimit: number,
      creditedCount: number,
      sourceElement?: HTMLButtonElement
    ) => {
      if (readOnly) {
        return;
      }
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
        sourceRect: sourceElement
          ? captureViewportRect(sourceElement)
          : undefined,
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
        if (isProgressContextAuthenticationError(error)) {
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
    [loadData, pendingRetroDate, readOnly, redirectToLogin, runCompletionMutation]
  );

  const toggleRecurringDateSelection = useCallback(
    async (
      goal: Goal,
      completionDate: string,
      hasCompletionOnDate: boolean,
      sourceElement?: HTMLButtonElement
    ) => {
      if (readOnly) {
        return;
      }
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
        sourceRect: sourceElement
          ? captureViewportRect(sourceElement)
          : undefined,
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
        if (isProgressContextAuthenticationError(error)) {
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
    [loadData, pendingRetroDate, readOnly, redirectToLogin, runCompletionMutation]
  );

  const saveMilestoneNames = useCallback(
    async (goal: Goal, names: string[]) => {
      if (readOnly) {
        return false;
      }
      if (goal.owner_id !== state.userId) {
        toast.error("Only the goal owner can rename milestones.");
        return false;
      }

      setSavingMilestoneNamesGoalId(goal.id);
      const currentScrollY = window.scrollY;
      try {
        const { error } = await supabase.rpc("set_goal_milestone_names", {
          p_goal_id: goal.id,
          p_milestone_names: names,
        });
        if (error) {
          toast.error(error.message);
          return false;
        }

        toast.success("Milestone names updated.");
        await withPlannerRefreshTimeout({
          operation: loadData({ showLoading: false, forceRefresh: true }),
          timeoutMessage: "Insights refresh timed out. Please refresh to sync.",
        });
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
        return true;
      } catch (error) {
        if (isProgressContextAuthenticationError(error)) {
          redirectToLogin();
          return false;
        }
        toast.error(
          getApiErrorMessage(error, "Milestone names update failed.")
        );
        return false;
      } finally {
        setSavingMilestoneNamesGoalId(null);
      }
    },
    [loadData, readOnly, redirectToLogin, state.userId, supabase]
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
    [goalMonthOverrides, monthCursor, setMonthCursor]
  );

  const aggregateDrilldownItems = useMemo(
    () =>
      aggregateDrilldownDate
        ? aggregateCompletionItemsByDate[aggregateDrilldownDate] ?? []
        : [],
    [aggregateCompletionItemsByDate, aggregateDrilldownDate]
  );
  const aggregateDrilldownMarkers = useMemo<AggregateDrilldownCompletionMarker[]>(
    () =>
      aggregateDrilldownItems.map((title, index) => ({
        key: `${aggregateDrilldownDate ?? "none"}-${title}-${index}`,
        goalTitle: title,
        scheduledDate: aggregateDrilldownDate,
      })),
    [aggregateDrilldownDate, aggregateDrilldownItems]
  );
  const clearAggregateDrilldown = useCallback(() => {
    setAggregateDrilldownDate(null);
    setAggregateDrilldownExpanded(false);
    setAggregateDrilldownPosition(null);
  }, []);

  useOutsidePointerDismiss({
    enabled: aggregateDrilldownDate !== null && !aggregateDrilldownExpanded,
    containerRef: aggregateDrilldownRef,
    onDismiss: clearAggregateDrilldown,
  });

  if (loading) {
    return (
      <LoadingCard
        title="Loading insights..."
        description="Crunching your completion history."
      />
    );
  }

  if (laneError) {
    return (
      <p className="px-1 text-sm text-muted-foreground">{laneError}</p>
    );
  }

  return (
    <div className="space-y-5">
      <InsightsOverallStatsCard
        heatmapRef={aggregateHeatmapRef}
        selectedYearStart={selectedYearStart}
        selectedYearEnd={selectedYearEnd}
        values={aggregateHeatmapData}
        overallCompletion={overallCompletion}
        classForValue={(value) =>
          `${getHeatmapScaleClass(value?.count ?? 0)} cursor-pointer ${getAggregateDrilldownDayClass(value?.date)}`
        }
        titleForValue={(value) =>
          `${value?.date ?? "N/A"}: ${value?.count ?? 0} completion${
            (value?.count ?? 0) === 1 ? "" : "s"
          }`
        }
        onDayClick={(value) => {
          if (value?.date) {
            setAggregateDrilldownDate(value.date);
            setAggregateDrilldownExpanded(false);
            const tile = aggregateHeatmapRef.current?.querySelector(
              `.${getAggregateDrilldownDayClass(value.date)}`
            );
            if (tile instanceof Element) {
              const rect = tile.getBoundingClientRect();
              setAggregateDrilldownPosition(
                computeDayPreviewPosition({
                  rect: {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                  },
                  viewportWidth: window.innerWidth,
                  viewportHeight: window.innerHeight,
                })
              );
            } else {
              setAggregateDrilldownPosition(null);
            }
          }
        }}
      />

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div
            data-title-date-row="true"
            className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CalendarRange className="size-4 shrink-0 text-primary" />
              <CardTitle>Goal Stats</CardTitle>
            </div>
            {sharedPeriod ? null : (
              <div className="justify-self-center">
                <InsightsPeriodStepper
                  monthCursor={monthCursor}
                  onMonthCursorChange={setMonthCursor}
                  perGoalViewMode={perGoalViewMode}
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            {sharedPeriod ? null : (
              <InsightsPeriodControls
                monthCursor={monthCursor}
                onMonthCursorChange={setMonthCursor}
                perGoalViewMode={perGoalViewMode}
                onPerGoalViewModeChange={setPerGoalViewMode}
                includeStepper={false}
                viewModeSelectId="insights-goal-stats-view-mode"
              />
            )}
            <GoalListControls
              goals={personalGoals}
              referenceMonth={goalFilterStartMonth}
              endMonth={effectiveGoalEndMonth}
              onEndMonthChange={setGoalEndMonth}
              sort={goalSort}
              onSortChange={setGoalSort}
              mode="native"
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

      <Card className="border-0 bg-transparent py-0 shadow-none ring-0">
        <CardContent
          className="space-y-3 px-0"
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
              const canEditHistory = !readOnly && (isRecurring || isMilestone);
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
              const goalCategoryLabel = getGoalCategoryLabel(
                goal.category,
                goal.category_key
              );
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
                            className={`w-fit ${getCategoryBadgeClass(goal.category_key ?? goal.category)}`}
                          >
                            {goalCategoryLabel}
                          </Badge>
                          <GoalEndMonthBadge endDate={goal.end_date} />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canEditHistory ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={editingHistory ? "secondary" : "outline"}
                            disabled={savingMilestoneNamesGoalId === goal.id}
                            onClick={() => {
                              void (async () => {
                                if (editingHistory) {
                                  if (isMilestone && milestoneNamesChanged) {
                                    const saved = await saveMilestoneNames(
                                      goal,
                                      buildMilestoneNames(
                                        milestoneTargetCount,
                                        draftMilestoneNames
                                      )
                                    );
                                    if (!saved) {
                                      return;
                                    }
                                  }
                                  setEditingGoalId(null);
                                  return;
                                }

                                setEditingGoalId(goal.id);
                                if (isMilestone) {
                                  setMilestoneNameDrafts((previous) => ({
                                    ...previous,
                                    [goal.id]: persistedMilestoneNames,
                                  }));
                                }
                              })();
                            }}
                          >
                            <PencilLine className="size-3.5" />
                            {editingHistory
                              ? savingMilestoneNamesGoalId === goal.id
                                ? "Saving..."
                                : "Done"
                              : isRecurring
                                ? "Edit dates"
                                : "Edit milestones"}
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
                            {...(editingHistory
                              ? {
                                  onDayClick: (
                                    date: string,
                                    sourceElement: HTMLButtonElement
                                  ) =>
                                    void toggleMilestoneDateSelection(
                                      goal,
                                      date,
                                      milestoneCompletionDates,
                                      milestoneTargetCount,
                                      progress?.creditedUnitCount ?? 0,
                                      sourceElement
                                    ),
                                }
                              : {})}
                          />
                        ) : (
                          <div className="overflow-x-auto py-1">
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
                              {...(editingHistory
                                ? {
                                    onClick: (value?: { date?: string }) => {
                                      const selectedDate = value?.date;
                                      if (!selectedDate) {
                                        return;
                                      }
                                      void toggleMilestoneDateSelection(
                                        goal,
                                        selectedDate,
                                        milestoneCompletionDates,
                                        milestoneTargetCount,
                                        progress?.creditedUnitCount ?? 0
                                      );
                                    },
                                  }
                                : {})}
                            />
                          </div>
                        )}
                        {editingHistory && isMilestone ? (
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
                            {...(editingHistory
                              ? {
                                  onDayClick: (
                                    date: string,
                                    sourceElement: HTMLButtonElement
                                  ) =>
                                    void toggleRecurringDateSelection(
                                      goal,
                                      date,
                                      (countsByDate[date] ?? 0) > 0,
                                      sourceElement
                                    ),
                                }
                              : {})}
                          />
                        ) : (
                          <div className="overflow-x-auto py-1">
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
                              {...(editingHistory
                                ? {
                                    onClick: (value?: { date?: string }) => {
                                      const selectedDate = value?.date;
                                      if (!selectedDate) {
                                        return;
                                      }
                                      void toggleRecurringDateSelection(
                                        goal,
                                        selectedDate,
                                        (countsByDate[selectedDate] ?? 0) > 0
                                      );
                                    },
                                  }
                                : {})}
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

      {aggregateDrilldownDate && !aggregateDrilldownExpanded ? (
        <AnchoredPopupCard
          popupRef={aggregateDrilldownRef}
          position={aggregateDrilldownPosition}
          fallbackTop={16}
          fallbackLeft={16}
          fallbackWidth={320}
          title={`Completions on ${format(parseISO(aggregateDrilldownDate), "MMM d, yyyy")}`}
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setAggregateDrilldownExpanded(true)}
              >
                <Maximize2 className="mr-1 size-3" />
                Expand
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={clearAggregateDrilldown}
                aria-label="Close drilldown"
              >
                <X className="size-3" />
              </Button>
            </>
          }
        >
          <p className="text-xs text-muted-foreground">
            {aggregateCountsByDate[aggregateDrilldownDate] ?? 0} completion
            {(aggregateCountsByDate[aggregateDrilldownDate] ?? 0) === 1 ? "" : "s"}
          </p>
          <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
            {aggregateDrilldownItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed items on this date.
              </p>
            ) : (
              <CalendarDayPreviewList
                day={aggregateDrilldownDate}
                entries={[]}
                completionFactMarkers={aggregateDrilldownMarkers}
                mutationLoading={false}
                getEntryDisplayTitle={() => ""}
                getEntrySubtitle={() => null}
                isEntryCredited={() => false}
                isEntryImmovableForDraft={() => true}
                getCompletionToggleState={() => ({
                  currentlyCredited: false,
                  disabledReasonCopy: "Read-only completion history.",
                })}
                onEntryOpen={() => undefined}
                onToggleCompletion={() => undefined}
                onEntryPointerStart={() => undefined}
                onEntryPointerEnd={() => undefined}
                density="expanded"
              />
            )}
          </div>
        </AnchoredPopupCard>
      ) : null}

      <Dialog
        open={aggregateDrilldownDate !== null && aggregateDrilldownExpanded}
        onOpenChange={(open) => {
          if (!open) {
            setAggregateDrilldownExpanded(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {aggregateDrilldownDate
                ? `Completions on ${format(parseISO(aggregateDrilldownDate), "MMMM d, yyyy")}`
                : "Completions"}
            </DialogTitle>
            <DialogDescription>
              {aggregateDrilldownDate
                ? `${aggregateCountsByDate[aggregateDrilldownDate] ?? 0} completion${
                    (aggregateCountsByDate[aggregateDrilldownDate] ?? 0) === 1
                      ? ""
                      : "s"
                  }`
                : "Review completions for a selected heatmap tile."}
            </DialogDescription>
          </DialogHeader>
          {aggregateDrilldownDate ? (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {aggregateDrilldownItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed items on this date.
                </p>
              ) : (
                <CalendarDayPreviewList
                  day={aggregateDrilldownDate}
                  entries={[]}
                  completionFactMarkers={aggregateDrilldownMarkers}
                  mutationLoading={false}
                  getEntryDisplayTitle={() => ""}
                  getEntrySubtitle={() => null}
                  isEntryCredited={() => false}
                  isEntryImmovableForDraft={() => true}
                  getCompletionToggleState={() => ({
                    currentlyCredited: false,
                    disabledReasonCopy: "Read-only completion history.",
                  })}
                  onEntryOpen={() => undefined}
                  onToggleCompletion={() => undefined}
                  onEntryPointerStart={() => undefined}
                  onEntryPointerEnd={() => undefined}
                  density="expanded"
                />
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

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
