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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingCard } from "@/components/ui/loading-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type RecurrenceFilter,
  type RecurrenceGroup,
} from "@/features/today/checklist-selectors";
import { ChecklistTodayGroups } from "@/features/today/checklist-today-groups";
import { TodayHeaderCard } from "@/features/today/today-header-card";
import { GoalCard } from "@/features/today/goal-card";
import { useChecklistData } from "@/features/today/use-checklist-data";
import { captureViewportRect } from "@/lib/xp/events";
import { PartnerChecklistStrip } from "@/features/social/duo/partner-checklist-strip";
import type { DuoActivePartner } from "@cadence/shared/social/duo";
import { buildCompletableGoalIds, selectCompletableGoals } from "@/lib/goals/completable-goals";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import {
  DEFAULT_GOAL_CATEGORIES,
  resolveCategoryKey,
} from "@/lib/goals/category";
import { getGoalLifecycle } from "@/lib/goals/lifecycle";
import {
  filterGoalsByEndMonth,
  resolveEffectiveEndMonth,
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

export type ChecklistTabValue = "today" | "not-today";

const allCategoriesFilterValue = "__all_categories__";

interface TodayTabProps {
  activeTab?: ChecklistTabValue;
  onActiveTabChange?: (tab: ChecklistTabValue) => void;
  hideTabList?: boolean;
  isActive?: boolean;
  refreshToken?: number;
  subjectUserId?: string;
  readOnly?: boolean;
  partnerSummary?: DuoActivePartner | null;
  onOpenPartner?: () => void;
}

export function TodayTab({
  activeTab,
  onActiveTabChange,
  hideTabList = false,
  isActive = true,
  refreshToken = 0,
  subjectUserId,
  readOnly = false,
  partnerSummary = null,
  onOpenPartner,
}: TodayTabProps = {}) {
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] =
    useState<Record<RecurrenceGroup, boolean>>(INITIAL_GROUP_EXPANDED);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(allCategoriesFilterValue);
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceFilter>("all");
  const [todayGoalSearchQuery, setTodayGoalSearchQuery] = useState("");
  const [todayFiltersOpen, setTodayFiltersOpen] = useState(false);
  const [viewDate, setViewDate] = useState(toLocalDateString());
  const [todayEndMonth, setTodayEndMonth] = useState<string | null>(null);
  const [todaySort, setTodaySort] = useState<GoalDateSort>("earliest_end");
  const [notTodayEndMonth, setNotTodayEndMonth] = useState<string | null>(null);
  const [notTodaySort, setNotTodaySort] = useState<GoalDateSort>("earliest_end");
  const [internalChecklistTab, setInternalChecklistTab] =
    useState<ChecklistTabValue>(activeTab ?? "today");
  const effectiveChecklistTab = activeTab ?? internalChecklistTab;
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
  const effectiveTodayEndMonth = resolveEffectiveEndMonth(
    todayEndMonth,
    checklistFilterStartMonth
  );
  const effectiveNotTodayEndMonth = resolveEffectiveEndMonth(
    notTodayEndMonth,
    checklistFilterStartMonth
  );

  const filteredTodayGoals = useMemo(
    () =>
      selectFilteredTodayGoals({
        activeGoals,
        todayDate,
        categoryFilter,
        allCategoriesFilterValue,
        recurrenceFilter,
        searchQuery: todayGoalSearchQuery,
        endMonth: effectiveTodayEndMonth,
      }),
    [
      activeGoals,
      categoryFilter,
      effectiveTodayEndMonth,
      recurrenceFilter,
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
      recurrenceFilter === "all"
        ? groupGoalsByRecurrence(filteredTodayGoals, todaySort)
        : [],
    [filteredTodayGoals, recurrenceFilter, todaySort]
  );

  const prepareNotTodayGoals = useCallback(
    (goals: Goal[]) =>
      sortGoalsByDate(filterGoalsByEndMonth(goals, effectiveNotTodayEndMonth), notTodaySort),
    [effectiveNotTodayEndMonth, notTodaySort]
  );

  const upcoming = useMemo(
    () => prepareNotTodayGoals(selectUpcomingGoals(activeGoals, todayDate)),
    [activeGoals, prepareNotTodayGoals, todayDate]
  );

  const completedGoals = useMemo(
    () =>
      prepareNotTodayGoals(
        selectEndedGoals({
          completableGoals,
          lifecycleByGoalAtViewDate,
        })
      ),
    [completableGoals, lifecycleByGoalAtViewDate, prepareNotTodayGoals]
  );

  const archivedGoals = useMemo(
    () => prepareNotTodayGoals(selectArchivedGoals(completableGoals)),
    [completableGoals, prepareNotTodayGoals]
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
    setViewDate((previous) => format(subDays(parseISO(previous), 1), "yyyy-MM-dd"));
  };

  const goToNextDate = () => {
    setViewDate((previous) => format(addDays(parseISO(previous), 1), "yyyy-MM-dd"));
  };
  const switchChecklistTab = useCallback(
    (nextTab: ChecklistTabValue) => {
      if (!activeTab) {
        setInternalChecklistTab(nextTab);
      }
      onActiveTabChange?.(nextTab);
    },
    [activeTab, onActiveTabChange]
  );

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
  const recurrenceQuickFilters = recurrenceFilterOptions.filter(
    (option) => option.value !== "fixed"
  );

  if (loading) {
    return (
      <div className="space-y-5">
        {partnerSummary && onOpenPartner ? (
          <PartnerChecklistStrip
            partner={partnerSummary}
            viewDate={viewDate}
            onOpenPartner={onOpenPartner}
          />
        ) : null}
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
      {partnerSummary && onOpenPartner ? (
        <PartnerChecklistStrip
          partner={partnerSummary}
          viewDate={viewDate}
          onOpenPartner={onOpenPartner}
        />
      ) : null}
      <Tabs
        value={effectiveChecklistTab}
        onValueChange={(value) => {
          const nextTab: ChecklistTabValue =
            value === "not-today" ? "not-today" : "today";
          switchChecklistTab(nextTab);
        }}
        className="flex-col space-y-4"
      >
        {hideTabList ? null : (
          <Card className="gap-0 p-1.5 shadow-sm">
            <TabsList className="grid h-8 w-full grid-cols-2">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="not-today">Past</TabsTrigger>
            </TabsList>
          </Card>
        )}

        <TabsContent value="today" className="space-y-5">
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
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="h-8 w-8 shrink-0 rounded-full"
                    onClick={() => setTodayFiltersOpen(true)}
                    aria-label="Open filters"
                    title="Open filters"
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </Button>
                  {hideTabList ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="hidden h-8 rounded-full px-3 text-xs md:inline-flex"
                      onClick={() => switchChecklistTab("not-today")}
                    >
                      Show Past
                    </Button>
                  ) : null}
                </div>
                <Dialog open={todayFiltersOpen} onOpenChange={setTodayFiltersOpen}>
                  <DialogContent className="top-auto bottom-0 left-1/2 max-h-[85vh] max-w-[calc(100%-1rem)] -translate-x-1/2 translate-y-0 overflow-y-auto rounded-b-none rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl">
                    <DialogHeader>
                      <DialogTitle>Today filters</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Category
                          </Label>
                          <Select
                            value={categoryFilter}
                            onValueChange={setCategoryFilter}
                          >
                            <SelectTrigger className="h-8 rounded-full bg-background/90 text-xs">
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={allCategoriesFilterValue}>
                                All categories
                              </SelectItem>
                              {availableCategories.map((category) => (
                                <SelectItem key={category.key} value={category.key}>
                                  {category.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="block space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Recurrence
                          </Label>
                          <Select
                            value={recurrenceFilter}
                            onValueChange={(value) =>
                              setRecurrenceFilter(value as RecurrenceFilter)
                            }
                          >
                            <SelectTrigger className="h-8 rounded-full bg-background/90 text-xs">
                              <SelectValue placeholder="Recurrence" />
                            </SelectTrigger>
                            <SelectContent>
                              {recurrenceFilterOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                      </div>
                      <GoalListControls
                        goals={completableGoals}
                        referenceMonth={checklistFilterStartMonth}
                        endMonth={effectiveTodayEndMonth}
                        onEndMonthChange={setTodayEndMonth}
                        sort={todaySort}
                        onSortChange={setTodaySort}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            }
            searchControls={
              <Input
                value={todayGoalSearchQuery}
                onChange={(event) => setTodayGoalSearchQuery(event.target.value)}
                placeholder="Search today's goals..."
                className="h-8 w-full"
              />
            }
            quickFilterControls={
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
                {recurrenceQuickFilters.map((option) => (
                  <Button
                    key={`recurrence-quick-${option.value}`}
                    type="button"
                    variant={recurrenceFilter === option.value ? "default" : "outline"}
                    size="sm"
                    className="h-8 shrink-0 rounded-full px-3 text-xs"
                    onClick={() => setRecurrenceFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
                {quickCategoryOptions.map((category) => (
                  <Button
                    key={`category-quick-${category.key}`}
                    type="button"
                    variant={categoryFilter === category.key ? "default" : "outline"}
                    size="sm"
                    className="h-8 shrink-0 rounded-full px-3 text-xs"
                    onClick={() =>
                      setCategoryFilter((previous) =>
                        previous === category.key ? allCategoriesFilterValue : category.key
                      )
                    }
                  >
                    {category.label}
                  </Button>
                ))}
              </div>
            }
          >
          <ChecklistTodayGroups
            recurrenceFilter={recurrenceFilter}
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
          </TodayHeaderCard>
        </TabsContent>

        <TabsContent value="not-today" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-xl">Past</CardTitle>
                  <CardDescription>Review upcoming, ended, and archived goals.</CardDescription>
                </div>
                {hideTabList ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="hidden h-8 rounded-full px-3 text-xs md:inline-flex"
                    onClick={() => switchChecklistTab("today")}
                  >
                    Show Today
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <GoalListControls
                goals={completableGoals}
                referenceMonth={checklistFilterStartMonth}
                endMonth={effectiveNotTodayEndMonth}
                onEndMonthChange={setNotTodayEndMonth}
                sort={notTodaySort}
                onSortChange={setNotTodaySort}
              />
            </CardContent>
          </Card>

          <ChecklistPastPanels
            upcoming={upcoming}
            completedGoals={completedGoals}
            archivedGoals={archivedGoals}
            upcomingOpen={upcomingOpen}
            completedOpen={completedOpen}
            archiveOpen={archiveOpen}
            onUpcomingOpenChange={setUpcomingOpen}
            onCompletedOpenChange={setCompletedOpen}
            onArchiveOpenChange={setArchiveOpen}
            renderGoal={renderGoalCard}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
