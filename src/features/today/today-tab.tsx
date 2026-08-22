"use client";

import { addDays, format, parseISO, subDays } from "date-fns";
import { SlidersHorizontal } from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckboxDropdown } from "@/components/ui/checkbox-dropdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingCard } from "@/components/ui/loading-card";
import { resolveSelectedDateState, toLocalDateString } from "@/lib/dates/day";
import { GoalListControls } from "@/features/goals/goal-list-controls";
import { ChecklistPastPanels } from "@/features/today/checklist-past-panels";
import {
  INITIAL_GROUP_EXPANDED,
  groupGoalsByRecurrence,
  recurrenceFilterOptions,
  selectActiveGoals,
  selectArchivedGoals,
  selectEndedGoals,
  selectFilteredTodayGoals,
  selectUpcomingGoals,
  type RecurrenceGroup,
} from "@/features/today/checklist-selectors";
import { ChecklistTodayGroups } from "@/features/today/checklist-today-groups";
import { TodayHeaderCard } from "@/features/today/today-header-card";
import { GoalCard } from "@/features/today/goal-card";
import { useChecklistData } from "@/features/today/use-checklist-data";
import { captureViewportRect } from "@/lib/xp/events";
import { PlannerTasksPanel } from "@/features/tasks/planner-tasks-panel";
import {
  buildCompletableGoalIds,
  selectCompletableGoals,
} from "@cadence/shared/goals/completable-goals";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import {
  DEFAULT_GOAL_CATEGORIES,
  resolveCategoryKey,
} from "@/lib/goals/category";
import { getGoalLifecycle } from "@/lib/goals/lifecycle";
import {
  filterGoalsByEndMonths,
  resolveEffectiveEndMonths,
  sortGoalsByDate,
  type GoalDateSort,
} from "@/lib/goals/list-view";
import { groupCompletionsByGoalId } from "@/lib/goals/completion-grouping";
import {
  isProgressContextAuthenticationError,
  progressSummaryMap,
} from "@/lib/goals/progress-context";
import {
  getCompletionsForCurrentPeriod,
  hasCompletionToday,
} from "@/lib/goals/schedule";
import type { Goal } from "@/lib/goals/types";
import {
  resolveCompletionDispatch,
} from "@/lib/planner/completion-dispatch";
import {
  getGoalRequirement,
  isTargetedRecurringGoal,
} from "@/lib/planner/requirements";
import { useCompletionMutation } from "@/features/planner/use-completion-mutation";
import { reportDuoTelemetry } from "@/lib/social/duo/telemetry";

export interface ChecklistSharedFilters {
  viewDate: string;
  setViewDate: (value: string) => void;
  showPastGoals: boolean;
  setShowPastGoals: (value: boolean) => void;
  showUpcomingGoals: boolean;
  setShowUpcomingGoals: (value: boolean) => void;
  showArchivedGoals: boolean;
  setShowArchivedGoals: (value: boolean) => void;
  showCompletedGoals: boolean;
  setShowCompletedGoals: (value: boolean) => void;
  categoryFilters: string[];
  setCategoryFilters: (value: string[]) => void;
  recurrenceFilters: RecurrenceGroup[];
  setRecurrenceFilters: (value: RecurrenceGroup[]) => void;
  todayGoalSearchQuery: string;
  setTodayGoalSearchQuery: (value: string) => void;
  todayEndMonths: string[];
  setTodayEndMonths: (value: string[]) => void;
  todaySort: GoalDateSort;
  setTodaySort: (value: GoalDateSort) => void;
}

export type ChecklistTabContentMode = "full" | "filters-only" | "goals-only";

interface TodayTabProps {
  isActive?: boolean;
  refreshToken?: number;
  subjectUserId?: string;
  readOnly?: boolean;
  sharedFilters?: ChecklistSharedFilters;
  showFiltersSection?: boolean;
  contentMode?: ChecklistTabContentMode;
}

export function TodayTab({
  isActive = true,
  refreshToken = 0,
  subjectUserId,
  readOnly = false,
  sharedFilters,
  showFiltersSection = true,
  contentMode = "full",
}: TodayTabProps = {}) {
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] =
    useState<Record<RecurrenceGroup, boolean>>(INITIAL_GROUP_EXPANDED);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [internalShowPastGoals, setInternalShowPastGoals] = useState(false);
  const [internalShowUpcomingGoals, setInternalShowUpcomingGoals] = useState(false);
  const [internalShowArchivedGoals, setInternalShowArchivedGoals] = useState(false);
  const [internalShowCompletedGoals, setInternalShowCompletedGoals] = useState(false);
  const [internalCategoryFilters, setInternalCategoryFilters] = useState<string[]>([]);
  const [internalRecurrenceFilters, setInternalRecurrenceFilters] = useState<
    RecurrenceGroup[]
  >([]);
  const [internalTodayGoalSearchQuery, setInternalTodayGoalSearchQuery] = useState("");
  const [todayFiltersOpen, setTodayFiltersOpen] = useState(false);
  const [internalViewDate, setInternalViewDate] = useState(toLocalDateString());
  const [internalTodayEndMonths, setInternalTodayEndMonths] = useState<string[]>([]);
  const [internalTodaySort, setInternalTodaySort] = useState<GoalDateSort>("earliest_end");
  const showPastGoals = sharedFilters?.showPastGoals ?? internalShowPastGoals;
  const setShowPastGoals = sharedFilters?.setShowPastGoals ?? setInternalShowPastGoals;
  const showUpcomingGoals = sharedFilters?.showUpcomingGoals ?? internalShowUpcomingGoals;
  const setShowUpcomingGoals =
    sharedFilters?.setShowUpcomingGoals ?? setInternalShowUpcomingGoals;
  const showArchivedGoals = sharedFilters?.showArchivedGoals ?? internalShowArchivedGoals;
  const setShowArchivedGoals =
    sharedFilters?.setShowArchivedGoals ?? setInternalShowArchivedGoals;
  const showCompletedGoals =
    sharedFilters?.showCompletedGoals ?? internalShowCompletedGoals;
  const setShowCompletedGoals =
    sharedFilters?.setShowCompletedGoals ?? setInternalShowCompletedGoals;
  const categoryFilters = sharedFilters?.categoryFilters ?? internalCategoryFilters;
  const setCategoryFilters = sharedFilters?.setCategoryFilters ?? setInternalCategoryFilters;
  const recurrenceFilters = sharedFilters?.recurrenceFilters ?? internalRecurrenceFilters;
  const setRecurrenceFilters =
    sharedFilters?.setRecurrenceFilters ?? setInternalRecurrenceFilters;
  const todayGoalSearchQuery =
    sharedFilters?.todayGoalSearchQuery ?? internalTodayGoalSearchQuery;
  const setTodayGoalSearchQuery =
    sharedFilters?.setTodayGoalSearchQuery ?? setInternalTodayGoalSearchQuery;
  const viewDate = sharedFilters?.viewDate ?? internalViewDate;
  const setViewDate = sharedFilters?.setViewDate ?? setInternalViewDate;
  const todayEndMonths = sharedFilters?.todayEndMonths ?? internalTodayEndMonths;
  const setTodayEndMonths = sharedFilters?.setTodayEndMonths ?? setInternalTodayEndMonths;
  const todaySort = sharedFilters?.todaySort ?? internalTodaySort;
  const setTodaySort = sharedFilters?.setTodaySort ?? setInternalTodaySort;
  const runCompletionMutation = useCompletionMutation();
  const { data, loading, laneError, loadData, redirectToLogin, todayLocalDate } = useChecklistData({
    subjectUserId,
    isActive,
    refreshToken,
    viewDate,
    failClosed: Boolean(readOnly && subjectUserId),
  });

  const viewDateObj = useMemo(() => parseISO(viewDate), [viewDate]);
  const viewingToday = viewDate === todayLocalDate;

  const completionsByGoal = useMemo(
    () => groupCompletionsByGoalId(data.completions),
    [data.completions]
  );
  const progressByGoal = useMemo(
    () => progressSummaryMap(data.progress),
    [data.progress]
  );
  const weeklyAnchor = useMemo(
    () => ({
      weekStartsOn: normalizeWeekStartsOn(data.progress?.weekStartsOn),
    }),
    [data.progress?.weekStartsOn]
  );
  // Day browsing answers "where did this goal belong on that date?" while
  // progress/outcome badges continue to show the latest known result.
  const lifecycleByGoalAtViewDate = useMemo(
    () =>
      new Map(
        data.goals.map((goal) => [
          goal.id,
          getGoalLifecycle(goal, { asOfDate: viewDate }),
        ])
      ),
    [data.goals, viewDate]
  );

  const completableGoalIds = useMemo(
    () =>
      buildCompletableGoalIds({
        goals: data.goals,
        userId: data.userId,
        memberTeamIds: data.memberTeamIds,
      }),
    [data.goals, data.memberTeamIds, data.userId]
  );

  const completableGoals = useMemo(
    () => selectCompletableGoals(data.goals, completableGoalIds),
    [completableGoalIds, data.goals]
  );
  const linkedCountByGoalId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of data.links) {
      counts.set(link.source_goal_id, (counts.get(link.source_goal_id) ?? 0) + 1);
    }
    return counts;
  }, [data.links]);

  const activeGoals = useMemo(
    () =>
      selectActiveGoals({
        completableGoals,
        lifecycleByGoalAtViewDate,
      }),
    [completableGoals, lifecycleByGoalAtViewDate]
  );

  const availableCategories = useMemo(
    () =>
      [...DEFAULT_GOAL_CATEGORIES]
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }
          return left.label.localeCompare(right.label);
        })
        .map((category) => ({ key: category.key, label: category.label })),
    []
  );

  const todayDate = viewDate;
  const checklistFilterStartMonth = viewDate.slice(0, 7);
  const effectiveTodayEndMonths = resolveEffectiveEndMonths(
    todayEndMonths,
    checklistFilterStartMonth
  );
  const completedTargetGoalIds = useMemo(
    () =>
      new Set(
        activeGoals
          .filter((goal) => progressByGoal.get(goal.id)?.outcome === "achieved")
          .map((goal) => goal.id)
      ),
    [activeGoals, progressByGoal]
  );

  const filteredTodayGoals = useMemo(
    () =>
      selectFilteredTodayGoals({
        activeGoals,
        todayDate,
        categoryFilters,
        recurrenceFilters,
        searchQuery: todayGoalSearchQuery,
        endMonths: effectiveTodayEndMonths,
        completedTargetGoalIds,
        showCompletedGoals,
      }),
    [
      activeGoals,
      categoryFilters,
      completedTargetGoalIds,
      effectiveTodayEndMonths,
      recurrenceFilters,
      showCompletedGoals,
      todayDate,
      todayGoalSearchQuery,
    ]
  );

  const todayGoalsSorted = useMemo(
    () => sortGoalsByDate(filteredTodayGoals, todaySort),
    [filteredTodayGoals, todaySort]
  );

  const groupedTodayGoalsForAll = useMemo(
    () =>
      recurrenceFilters.length === 0
        ? groupGoalsByRecurrence(filteredTodayGoals, todaySort)
        : [],
    [filteredTodayGoals, recurrenceFilters, todaySort]
  );

  const prepareSupplementalGoals = useCallback(
    (goals: Goal[]) =>
      sortGoalsByDate(
        filterGoalsByEndMonths(goals, effectiveTodayEndMonths),
        todaySort
      ),
    [effectiveTodayEndMonths, todaySort]
  );

  const upcoming = useMemo(
    () => prepareSupplementalGoals(selectUpcomingGoals(activeGoals, todayDate)),
    [activeGoals, prepareSupplementalGoals, todayDate]
  );

  const pastGoals = useMemo(
    () =>
      prepareSupplementalGoals(
        selectEndedGoals({
          completableGoals,
          lifecycleByGoalAtViewDate,
        })
      ),
    [completableGoals, lifecycleByGoalAtViewDate, prepareSupplementalGoals]
  );

  const archivedGoals = useMemo(
    () => prepareSupplementalGoals(selectArchivedGoals(completableGoals)),
    [completableGoals, prepareSupplementalGoals]
  );

  const toggleCompletion = useCallback(async (
    goal: Goal,
    sourceElement: HTMLButtonElement
  ) => {
    if (readOnly) {
      return;
    }
    const sourceRect = captureViewportRect(sourceElement);
    const completions = completionsByGoal.get(goal.id) ?? [];
    const completedOnViewDate = hasCompletionToday(completions, viewDateObj);
    const completionsInCurrentPeriod = getCompletionsForCurrentPeriod(
      goal,
      completions,
      viewDateObj,
      { weeklyAnchor }
    );
    const completedForCurrentPeriod = completionsInCurrentPeriod.length > 0;
    const latestCompletionInCurrentPeriod = [...completionsInCurrentPeriod]
      .sort((left, right) => left.completed_on.localeCompare(right.completed_on))
      .at(-1);
    const completionToUnmark = completedOnViewDate
      ? completions.find((completion) => completion.completed_on === viewDate)
      : latestCompletionInCurrentPeriod;
    const targetedRecurring = isTargetedRecurringGoal(goal);
    const requirement = getGoalRequirement(goal);
    const desiredFactState = completedOnViewDate ? "absent" : "present";
    const decision = resolveCompletionDispatch({
      requirementKind: requirement.kind,
      targetedRecurring,
      activePlanMembership: false,
      matchingItemState: "none",
      selectedDateState: resolveSelectedDateState(viewDate, todayLocalDate),
      existingExactFact: completedOnViewDate,
      desiredFactState,
    });

    setSavingGoalId(goal.id);
    const currentScrollY = window.scrollY;
    const routeDesiredFactState =
      decision.route === "legacy_period"
        ? completedForCurrentPeriod
          ? "absent"
          : "present"
        : desiredFactState;
    const dispatchDate =
      decision.route === "legacy_period" && routeDesiredFactState === "absent"
        ? completionToUnmark?.completed_on ?? viewDate
        : viewDate;

    const result = await runCompletionMutation({
      decision,
      desiredFactState: routeDesiredFactState,
      goalId: goal.id,
      date: dispatchDate,
      timezone: resolveUserTimezone(),
      sourceRect,
      blockedMessage:
        decision.reason === "future_creation"
          ? "You can only complete goals for today or past dates."
          : "This completion cannot be changed from this date.",
      fallbackErrorMessage: "The completion could not be updated.",
    });

    if (!result.ok) {
      toast.error(result.message ?? "The completion could not be updated.");
      setSavingGoalId(null);
      return;
    }

    if (routeDesiredFactState === "present") {
      reportDuoTelemetry("viewer_lane_completion", { surface: "checklist" });
      toast.success(`Great work. Goal completed for ${viewDate}.`);
    } else {
      const removedDate =
        decision.route === "legacy_period"
          ? completionToUnmark?.completed_on ?? viewDate
          : viewDate;
      toast.success(`Marked as incomplete for ${removedDate}.`);
    }

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
      setSavingGoalId(null);
    }
  }, [
    completionsByGoal,
    loadData,
    readOnly,
    redirectToLogin,
    runCompletionMutation,
    todayLocalDate,
    viewDate,
    viewDateObj,
    weeklyAnchor,
  ]);
  const renderGoalCard = useCallback(
    (goal: Goal, options?: { archived?: boolean; key?: string }) => {
      const archived = options?.archived ?? false;
      return (
        <GoalCard
          key={options?.key ?? goal.id}
          goal={goal}
          completions={completionsByGoal.get(goal.id) ?? []}
          progress={progressByGoal.get(goal.id)}
          linkedCount={linkedCountByGoalId.get(goal.id) ?? 0}
          imageUrl={data.photoUrls[goal.id]}
          disabled={archived || savingGoalId === goal.id}
          archived={archived}
          selectedDate={viewDate}
          referenceDate={viewDateObj}
          weeklyAnchor={weeklyAnchor}
          {...(readOnly
            ? { readOnly: true as const }
            : {
                readOnly: false as const,
                onToggle: (sourceElement: HTMLButtonElement) =>
                  toggleCompletion(goal, sourceElement),
              })}
        />
      );
    },
    [
      completionsByGoal,
      data.photoUrls,
      linkedCountByGoalId,
      progressByGoal,
      readOnly,
      savingGoalId,
      toggleCompletion,
      viewDate,
      viewDateObj,
      weeklyAnchor,
    ]
  );

  const goToPreviousDate = () => {
    setViewDate(format(subDays(viewDateObj, 1), "yyyy-MM-dd"));
  };

  const goToNextDate = () => {
    setViewDate(format(addDays(viewDateObj, 1), "yyyy-MM-dd"));
  };

  const quickCategoryOptions = useMemo(() => {
    const userKeys = new Set(
      data.goals.map((goal) => resolveCategoryKey(goal.category_key ?? goal.category))
    );
    const fromUser = availableCategories.filter((category) => userKeys.has(category.key));
    const picked = [...fromUser];
    for (const preset of availableCategories) {
      if (picked.length >= 4) {
        break;
      }
      if (!picked.some((option) => option.key === preset.key)) {
        picked.push(preset);
      }
    }
    return picked.slice(0, 4);
  }, [availableCategories, data.goals]);
  const categoryFilterOptions = availableCategories.map((category) => ({
    value: category.key,
    label: category.label,
  }));
  const recurrenceQuickFilters = recurrenceFilterOptions.filter(
    (option): option is { value: RecurrenceGroup; label: string } =>
      option.value !== "all"
  );
  const toggleCategoryFilter = useCallback(
    (categoryKey: string) => {
      setCategoryFilters(
        categoryFilters.includes(categoryKey)
          ? categoryFilters.filter((key) => key !== categoryKey)
          : [...categoryFilters, categoryKey]
      );
    },
    [categoryFilters, setCategoryFilters]
  );
  const toggleRecurrenceFilter = useCallback(
    (recurrence: RecurrenceGroup) => {
      setRecurrenceFilters(
        recurrenceFilters.includes(recurrence)
          ? recurrenceFilters.filter((value) => value !== recurrence)
          : [...recurrenceFilters, recurrence]
      );
    },
    [recurrenceFilters, setRecurrenceFilters]
  );
  const showFilterContainer =
    showFiltersSection && (contentMode === "full" || contentMode === "filters-only");
  const showGoalSections = contentMode === "full" || contentMode === "goals-only";

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingCard
          title="Loading your goals..."
          description="Pulling your latest status."
        />
      </div>
    );
  }

  if (laneError) {
    return (
      <p className="px-1 text-sm text-muted-foreground">{laneError}</p>
    );
  }

  return (
    <div className="space-y-5">
      {showFilterContainer ? (
        <TodayHeaderCard
          viewDate={viewDate}
          todayLocalDate={todayLocalDate}
          viewingToday={viewingToday}
          onViewDateChange={setViewDate}
          onGoToPreviousDate={goToPreviousDate}
          onGoToNextDate={goToNextDate}
          onResetToToday={() => setViewDate(todayLocalDate)}
          datePickerControls={
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="h-8 w-8 shrink-0 rounded-full"
                onClick={() => setTodayFiltersOpen(true)}
                aria-label="Open checklist filters"
                title="Open checklist filters"
              >
                <SlidersHorizontal className="size-3.5" />
              </Button>
              <Dialog open={todayFiltersOpen} onOpenChange={setTodayFiltersOpen}>
                <DialogContent className="top-auto bottom-0 left-1/2 max-h-[85vh] max-w-[calc(100%-1rem)] -translate-x-1/2 translate-y-0 overflow-y-auto rounded-b-none rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl">
                  <DialogHeader>
                    <DialogTitle>Checklist filters</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block min-w-0 space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Category
                        </Label>
                        <CheckboxDropdown
                          options={categoryFilterOptions}
                          selectedValues={categoryFilters}
                          onSelectedValuesChange={setCategoryFilters}
                          placeholder="All categories"
                          allLabel="All categories"
                          triggerClassName="h-8 rounded-full bg-background/90 text-xs"
                        />
                      </label>
                      <label className="block min-w-0 space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Recurrence
                        </Label>
                        <CheckboxDropdown
                          options={recurrenceQuickFilters}
                          selectedValues={recurrenceFilters}
                          onSelectedValuesChange={(values) =>
                            setRecurrenceFilters(values as RecurrenceGroup[])
                          }
                          placeholder="All types"
                          allLabel="All types"
                          triggerClassName="h-8 rounded-full bg-background/90 text-xs"
                        />
                      </label>
                    </div>
                    <GoalListControls
                      goals={completableGoals}
                      referenceMonth={checklistFilterStartMonth}
                      endMonths={effectiveTodayEndMonths}
                      onEndMonthsChange={setTodayEndMonths}
                      sort={todaySort}
                      onSortChange={setTodaySort}
                      className="grid grid-cols-2 gap-3 [&>div]:min-w-0 [&>div]:w-full [&_[role=combobox]]:w-full"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          label: "Show past goals",
                          count: pastGoals.length,
                          checked: showPastGoals,
                          onChange: setShowPastGoals,
                        },
                        {
                          label: "Show upcoming goals",
                          count: upcoming.length,
                          checked: showUpcomingGoals,
                          onChange: setShowUpcomingGoals,
                        },
                        {
                          label: "Show archived goals",
                          count: archivedGoals.length,
                          checked: showArchivedGoals,
                          onChange: setShowArchivedGoals,
                        },
                        {
                          label: "Show completed goals",
                          count: completedTargetGoalIds.size,
                          checked: showCompletedGoals,
                          onChange: setShowCompletedGoals,
                        },
                      ].map((option) => (
                        <label
                          key={option.label}
                          className="flex min-h-10 min-w-0 items-center gap-2 px-1.5 py-2 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={option.checked}
                            onChange={(event) =>
                              option.onChange(event.target.checked)
                            }
                            className="size-4 shrink-0 accent-primary"
                          />
                          <span className="min-w-0">
                            {option.label}
                            <span className="ml-1 text-muted-foreground">
                              ({option.count})
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          }
          searchControls={
            <Input
              value={todayGoalSearchQuery}
              onChange={(event) => setTodayGoalSearchQuery(event.target.value)}
              placeholder="Search checklist goals..."
              className="h-8 w-full"
            />
          }
          quickFilterControls={
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
              <Button
                key="recurrence-quick-all"
                type="button"
                variant={recurrenceFilters.length === 0 ? "default" : "outline"}
                size="sm"
                className="h-8 shrink-0 rounded-full px-3 text-xs"
                onClick={() => setRecurrenceFilters([])}
              >
                All types
              </Button>
              {recurrenceQuickFilters.map((option) => (
                <Button
                  key={`recurrence-quick-${option.value}`}
                  type="button"
                  variant={
                    recurrenceFilters.includes(option.value) ? "default" : "outline"
                  }
                  size="sm"
                  className="h-8 shrink-0 rounded-full px-3 text-xs"
                  onClick={() => toggleRecurrenceFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
              <Button
                key="category-quick-all"
                type="button"
                variant={categoryFilters.length === 0 ? "default" : "outline"}
                size="sm"
                className="h-8 shrink-0 rounded-full px-3 text-xs"
                onClick={() => setCategoryFilters([])}
              >
                All categories
              </Button>
              {quickCategoryOptions.map((category) => (
                <Button
                  key={`category-quick-${category.key}`}
                  type="button"
                  variant={
                    categoryFilters.includes(category.key) ? "default" : "outline"
                  }
                  size="sm"
                  className="h-8 shrink-0 rounded-full px-3 text-xs"
                  onClick={() => toggleCategoryFilter(category.key)}
                >
                  {category.label}
                </Button>
              ))}
            </div>
          }
        />
      ) : null}

      {showGoalSections ? (
        <ChecklistTodayGroups
          selectedRecurrenceFilters={recurrenceFilters}
          groups={groupedTodayGoalsForAll}
          sortedGoals={todayGoalsSorted}
          expandedGroups={expandedGroups}
          onToggleGroup={(group) =>
            setExpandedGroups((previous) => ({
              ...previous,
              [group]: !previous[group],
            }))
          }
          renderGoal={renderGoalCard}
        />
      ) : null}

      {showGoalSections && !readOnly ? (
        <div className="pt-3">
          <PlannerTasksPanel
            title="Tasks for this day"
            description="Simple one-time tasks for this day (separate from long-term or recurring goals). Add new tasks from the Tasks tab."
            scheduledDate={viewDate}
            allowCreate={false}
          />
        </div>
      ) : null}

      {showGoalSections && (showUpcomingGoals || showPastGoals || showArchivedGoals) ? (
        <ChecklistPastPanels
          upcoming={upcoming}
          pastGoals={pastGoals}
          archivedGoals={archivedGoals}
          showUpcoming={showUpcomingGoals}
          showPast={showPastGoals}
          showArchived={showArchivedGoals}
          upcomingOpen={upcomingOpen}
          pastOpen={completedOpen}
          archiveOpen={archiveOpen}
          onUpcomingOpenChange={setUpcomingOpen}
          onPastOpenChange={setCompletedOpen}
          onArchiveOpenChange={setArchiveOpen}
          renderGoal={renderGoalCard}
        />
      ) : null}
    </div>
  );
}
