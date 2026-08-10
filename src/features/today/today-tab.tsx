"use client";

import { addDays, format, parseISO, subDays } from "date-fns";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingCard } from "@/components/ui/loading-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildLoginHref } from "@/lib/auth/login-redirect";
import { GoalListControls } from "@/features/goals/goal-list-controls";
import { CollapsibleGoalSection } from "@/features/today/collapsible-goal-section";
import { TodayHeaderCard, type RecurrenceFilter } from "@/features/today/today-header-card";
import { GoalCard } from "@/features/today/goal-card";
import { GoalLoopScroller } from "@/features/today/goal-loop-scroller";
import { isAbortError, withAbortSignal } from "@/lib/async/abort";
import {
  resolveSelectedDateState,
  toLocalDateString,
} from "@/lib/dates/day";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import { normalizeWeekStartsOn } from "@/lib/dates/week-start";
import {
  buildCompletableGoalIds,
  selectCompletableGoals,
} from "@/lib/goals/completable-goals";
import { groupCompletionsByGoalId } from "@/lib/goals/completion-grouping";
import { getGoalLifecycle } from "@/lib/goals/lifecycle";
import {
  filterGoalsByEndMonth,
  resolveEffectiveEndMonth,
  sortGoalsByDate,
  type GoalDateSort,
} from "@/lib/goals/list-view";
import {
  fetchProgressContext,
  isProgressContextAuthenticationError,
  progressSummaryMap,
  type ProgressContextResponse,
} from "@/lib/goals/progress-context";
import {
  getCompletionsForCurrentPeriod,
  hasCompletionToday,
  isGoalManuallyArchived,
} from "@/lib/goals/schedule";
import type {
  CompletionDateFact,
  Goal,
  GoalLink,
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
import { createClient } from "@/lib/supabase/client";

interface TodayData {
  userId: string;
  goals: Goal[];
  completions: CompletionDateFact[];
  participants: GoalParticipant[];
  links: GoalLink[];
  photoUrls: Record<string, string>;
  progress: ProgressContextResponse | null;
}

const emptyData: TodayData = {
  userId: "",
  goals: [],
  completions: [],
  participants: [],
  links: [],
  photoUrls: {},
  progress: null,
};

const allCategoriesFilterValue = "__all_categories__";
type RecurrenceGroup = "daily" | "weekly" | "monthly" | "fixed";
const VISIBLE_GOALS_PER_GROUP = 5;
const TODAY_REQUEST_TIMEOUT_MS = 15_000;
const INITIAL_GROUP_EXPANDED: Record<RecurrenceGroup, boolean> = {
  daily: false,
  weekly: false,
  monthly: false,
  fixed: false,
};

function getRecurrenceGroup(goal: Goal): RecurrenceGroup {
  if (goal.frequency_type === "fixed_milestones") {
    return "fixed";
  }

  if (goal.recurrence_interval === "weekly") {
    return "weekly";
  }

  if (goal.recurrence_interval === "monthly") {
    return "monthly";
  }

  return "daily";
}

const recurrenceGroupOrder: RecurrenceGroup[] = ["daily", "weekly", "monthly", "fixed"];

const recurrenceGroupLabel: Record<RecurrenceGroup, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  fixed: "Fixed",
};

export type ChecklistTabValue = "today" | "not-today";

interface TodayTabProps {
  activeTab?: ChecklistTabValue;
  onActiveTabChange?: (tab: ChecklistTabValue) => void;
  hideTabList?: boolean;
  isActive?: boolean;
  refreshToken?: number;
}

export function TodayTab({
  activeTab,
  onActiveTabChange,
  hideTabList = false,
  isActive = true,
  refreshToken = 0,
}: TodayTabProps = {}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [data, setData] = useState<TodayData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] =
    useState<Record<RecurrenceGroup, boolean>>(INITIAL_GROUP_EXPANDED);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(allCategoriesFilterValue);
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceFilter>("all");
  const [todayGoalSearchQuery, setTodayGoalSearchQuery] = useState("");
  const [viewDate, setViewDate] = useState(toLocalDateString());
  const [todayEndMonth, setTodayEndMonth] = useState<string | null>(null);
  const [todaySort, setTodaySort] = useState<GoalDateSort>("earliest_end");
  const [notTodayEndMonth, setNotTodayEndMonth] = useState<string | null>(null);
  const [notTodaySort, setNotTodaySort] = useState<GoalDateSort>("earliest_end");
  const [internalChecklistTab, setInternalChecklistTab] =
    useState<ChecklistTabValue>(activeTab ?? "today");
  const loadRequestIdRef = useRef(0);
  const visibleLoadCountRef = useRef(0);
  const refreshTokenRef = useRef(refreshToken);
  const pendingRefreshRef = useRef(false);
  const authRedirectStartedRef = useRef(false);
  const effectiveChecklistTab = activeTab ?? internalChecklistTab;
  const runCompletionMutation = useCompletionMutation();

  const viewDateObj = useMemo(() => parseISO(viewDate), [viewDate]);
  const todayLocalDate = toLocalDateString();
  const viewingToday = viewDate === todayLocalDate;
  const normalizedTodayGoalSearchQuery = useMemo(
    () => todayGoalSearchQuery.trim().toLowerCase(),
    [todayGoalSearchQuery]
  );

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
        TODAY_REQUEST_TIMEOUT_MS
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
          setData(emptyData);
          redirectToLogin();
          return;
        }

        const [goalsResponse, participantsResponse, linksResponse, progress] =
          await withAbortSignal(
            Promise.all([
              supabase
                .from("goals")
                .select("*")
                .eq("is_deleted", false)
                .order("created_at", { ascending: false }),
              supabase.from("goal_participants").select("*").eq("user_id", user.id),
              supabase.from("goal_links").select("*").eq("owner_id", user.id),
              fetchProgressContext({
                asOfDate: todayLocalDate,
                viewDate,
                forceRefresh,
              }),
            ]),
            controller.signal
          );

        const goals = (goalsResponse.data ?? []) as Goal[];
        const completions = progress.facts;
        const participants = (participantsResponse.data ?? []) as GoalParticipant[];
        const links = (linksResponse.data ?? []) as GoalLink[];

        const photoUrls: Record<string, string> = {};
        await withAbortSignal(
          Promise.all(
            goals
              .filter((goal) => goal.photo_path)
              .map(async (goal) => {
                if (!goal.photo_path) {
                  return;
                }
                const { data: signedData } = await supabase.storage
                  .from("goal-photos")
                  .createSignedUrl(goal.photo_path, 60 * 60);
                if (signedData?.signedUrl) {
                  photoUrls[goal.id] = signedData.signedUrl;
                }
              })
          ),
          controller.signal
        );

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        setData({
          userId: user.id,
          goals,
          completions,
          participants,
          links,
          photoUrls,
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
    [redirectToLogin, supabase, todayLocalDate, viewDate]
  );

  useEffect(() => {
    const run = async () => {
      try {
        await loadData();
      } catch (error) {
        if (isProgressContextAuthenticationError(error)) {
          redirectToLogin();
          return;
        }
        toast.error(
          isAbortError(error)
            ? "Today goals request timed out. Please try again."
            : error instanceof Error
              ? error.message
              : "Goal progress could not be loaded."
        );
      }
    };

    void run();
  }, [loadData, redirectToLogin]);

  useEffect(() => {
    if (refreshToken === refreshTokenRef.current) {
      return;
    }

    refreshTokenRef.current = refreshToken;
    if (isActive) {
      const timer = window.setTimeout(() => {
        void loadData({ showLoading: false, forceRefresh: true }).catch(
          (error: unknown) => {
            if (isProgressContextAuthenticationError(error)) {
              redirectToLogin();
              return;
            }
            toast.error(
              isAbortError(error)
                ? "Today goals request timed out. Please try again."
                : error instanceof Error
                  ? error.message
                  : "Goal progress could not be loaded."
            );
          }
        );
      }, 0);
      pendingRefreshRef.current = false;
      return () => window.clearTimeout(timer);
    }

    pendingRefreshRef.current = true;
  }, [isActive, loadData, redirectToLogin, refreshToken]);

  useEffect(() => {
    if (!isActive || !pendingRefreshRef.current) {
      return;
    }
    pendingRefreshRef.current = false;
    const timer = window.setTimeout(() => {
      void loadData({ showLoading: false, forceRefresh: true }).catch(
        (error: unknown) => {
          if (isProgressContextAuthenticationError(error)) {
            redirectToLogin();
            return;
          }
          toast.error(
            isAbortError(error)
              ? "Today goals request timed out. Please try again."
              : error instanceof Error
                ? error.message
                : "Goal progress could not be loaded."
          );
        }
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isActive, loadData, redirectToLogin]);

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
        participants: data.participants,
        userId: data.userId,
      }),
    [data.goals, data.participants, data.userId]
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

  const activeGoals = useMemo(() => {
    return completableGoals.filter((goal) => {
      const lifecycle = lifecycleByGoalAtViewDate.get(goal.id);
      return (
        lifecycle !== "ended" &&
        lifecycle !== "archived" &&
        !isGoalManuallyArchived(goal)
      );
    });
  }, [completableGoals, lifecycleByGoalAtViewDate]);

  const availableCategories = useMemo(() => {
    const categories = new Set<string>();
    data.goals.forEach((goal) => {
      const category = goal.category.trim();
      if (category.length > 0) {
        categories.add(category);
      }
    });

    return Array.from(categories).sort((left, right) => left.localeCompare(right));
  }, [data.goals]);

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
  const matchesTodayFacetFilters = useCallback(
    (goal: Goal) => {
      if (categoryFilter !== allCategoriesFilterValue && goal.category !== categoryFilter) {
        return false;
      }

      if (recurrenceFilter !== "all") {
        if (recurrenceFilter === "fixed") {
          if (goal.frequency_type !== "fixed_milestones") {
            return false;
          }
        } else if (
          goal.frequency_type !== "recurring" ||
          goal.recurrence_interval !== recurrenceFilter
        ) {
          return false;
        }
      }

      return true;
    },
    [categoryFilter, recurrenceFilter]
  );

  const filteredTodayGoals = useMemo(() => {
    const matchingGoals = activeGoals
        .filter((goal) => goal.start_date <= todayDate)
        .filter(matchesTodayFacetFilters)
        .filter((goal) =>
          normalizedTodayGoalSearchQuery.length === 0
            ? true
            : goal.title.toLowerCase().includes(normalizedTodayGoalSearchQuery)
        );

    return filterGoalsByEndMonth(matchingGoals, effectiveTodayEndMonth);
  }, [
    activeGoals,
    effectiveTodayEndMonth,
    matchesTodayFacetFilters,
    normalizedTodayGoalSearchQuery,
    todayDate,
  ]);

  const todayGoalsSorted = useMemo(
    () => sortGoalsByDate(filteredTodayGoals, todaySort),
    [filteredTodayGoals, todaySort]
  );

  const groupGoalsByRecurrence = useCallback(
    (goals: Goal[]) => {
      const grouped: Record<RecurrenceGroup, Goal[]> = {
        daily: [],
        weekly: [],
        monthly: [],
        fixed: [],
      };

      goals.forEach((goal) => {
        grouped[getRecurrenceGroup(goal)].push(goal);
      });

      return recurrenceGroupOrder
        .map((group) => ({
          key: group,
          label: recurrenceGroupLabel[group],
          goals: sortGoalsByDate(grouped[group], todaySort),
        }))
        .filter((group) => group.goals.length > 0);
    },
    [todaySort]
  );

  const groupedTodayGoalsForAll = useMemo(
    () => (recurrenceFilter === "all" ? groupGoalsByRecurrence(filteredTodayGoals) : []),
    [filteredTodayGoals, groupGoalsByRecurrence, recurrenceFilter]
  );

  const completedGoalsRaw = useMemo(
    () =>
      completableGoals.filter((goal) => {
        if (isGoalManuallyArchived(goal)) {
          return false;
        }
        return lifecycleByGoalAtViewDate.get(goal.id) === "ended";
      }),
    [completableGoals, lifecycleByGoalAtViewDate]
  );

  const archivedGoalsRaw = useMemo(
    () => completableGoals.filter((goal) => isGoalManuallyArchived(goal)),
    [completableGoals]
  );

  const prepareNotTodayGoals = useCallback(
    (goals: Goal[]) =>
      sortGoalsByDate(filterGoalsByEndMonth(goals, effectiveNotTodayEndMonth), notTodaySort),
    [effectiveNotTodayEndMonth, notTodaySort]
  );

  const upcoming = useMemo(
    () => prepareNotTodayGoals(activeGoals.filter((goal) => goal.start_date > todayDate)),
    [activeGoals, prepareNotTodayGoals, todayDate]
  );

  const completedGoals = useMemo(
    () => prepareNotTodayGoals(completedGoalsRaw),
    [completedGoalsRaw, prepareNotTodayGoals]
  );

  const archivedGoals = useMemo(
    () => prepareNotTodayGoals(archivedGoalsRaw),
    [archivedGoalsRaw, prepareNotTodayGoals]
  );

  const toggleCompletion = useCallback(async (goal: Goal) => {
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
          onToggle={archived ? () => undefined : () => toggleCompletion(goal)}
        />
      );
    },
    [
      completionsByGoal,
      data.photoUrls,
      linkedCountByGoalId,
      progressByGoal,
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

  if (loading) {
    return (
      <LoadingCard
        title="Loading your goals..."
        description="Pulling your latest progress from Supabase."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Tabs
        value={effectiveChecklistTab}
        onValueChange={(value) => {
          const nextTab: ChecklistTabValue =
            value === "not-today" ? "not-today" : "today";
          if (!activeTab) {
            setInternalChecklistTab(nextTab);
          }
          onActiveTabChange?.(nextTab);
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
            viewDateObj={viewDateObj}
            viewDate={viewDate}
            todayLocalDate={todayLocalDate}
            viewingToday={viewingToday}
            onViewDateChange={setViewDate}
            onGoToPreviousDate={goToPreviousDate}
            onGoToNextDate={goToNextDate}
            onResetToToday={() => setViewDate(todayLocalDate)}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            recurrenceFilter={recurrenceFilter}
            onRecurrenceFilterChange={setRecurrenceFilter}
            availableCategories={availableCategories}
            allCategoriesFilterValue={allCategoriesFilterValue}
            goals={completableGoals}
            referenceMonth={checklistFilterStartMonth}
            endMonth={effectiveTodayEndMonth}
            onEndMonthChange={setTodayEndMonth}
            sort={todaySort}
            onSortChange={setTodaySort}
          >
          <Input
            value={todayGoalSearchQuery}
            onChange={(event) => setTodayGoalSearchQuery(event.target.value)}
            placeholder="Search today's goals..."
            className="h-8"
          />
          {todayGoalsSorted.length === 0 ? (
            <Card className="shadow-none">
              <CardContent className="py-6 text-sm text-muted-foreground">
                No goals match these filters for this date.
              </CardContent>
            </Card>
          ) : recurrenceFilter === "all" ? (
            <div className="space-y-4">
              {groupedTodayGoalsForAll.map((group) => {
                const canLoop = group.goals.length > VISIBLE_GOALS_PER_GROUP;
                const isExpanded = expandedGroups[group.key];

                return (
                  <div key={`pending-${group.key}`} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </p>
                      {canLoop ? (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>
                            {VISIBLE_GOALS_PER_GROUP} visible of {group.goals.length}
                          </span>
                          <button
                            type="button"
                            className="font-medium text-primary transition-colors hover:text-primary/80"
                            onClick={() =>
                              setExpandedGroups((previous) => ({
                                ...previous,
                                [group.key]: !previous[group.key],
                              }))
                            }
                          >
                            {isExpanded ? "Collapse" : "Expand"}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {canLoop && !isExpanded ? (
                      <div className="rounded-xl border bg-muted/15 p-2">
                        <GoalLoopScroller
                          goals={group.goals}
                          renderGoal={(goal) => renderGoalCard(goal)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {group.goals.map((goal) => renderGoalCard(goal, { key: goal.id }))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {todayGoalsSorted.map((goal) => renderGoalCard(goal, { key: goal.id }))}
            </div>
          )}
          </TodayHeaderCard>
        </TabsContent>

        <TabsContent value="not-today" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Past</CardTitle>
              <CardDescription>Review upcoming, ended, and archived goals.</CardDescription>
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

          <CollapsibleGoalSection
            open={upcomingOpen}
            onOpenChange={setUpcomingOpen}
            title="Upcoming"
            count={upcoming.length}
            icon={<CalendarClock className="size-4 text-muted-foreground" />}
            emptyMessage="No future goals yet."
          >
            {upcoming.map((goal) => renderGoalCard(goal, { key: goal.id }))}
          </CollapsibleGoalSection>

          <CollapsibleGoalSection
            open={completedOpen}
            onOpenChange={setCompletedOpen}
            title="Ended"
            count={completedGoals.length}
            icon={<CheckCircle2 className="size-4 text-muted-foreground" />}
            emptyMessage="No ended goals yet."
          >
            {completedGoals.map((goal) => renderGoalCard(goal, { key: goal.id }))}
          </CollapsibleGoalSection>

          <CollapsibleGoalSection
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            title="Archived"
            count={archivedGoals.length}
            icon={<Archive className="size-4 text-muted-foreground" />}
            emptyMessage="No archived goals yet."
          >
            {archivedGoals.map((goal) =>
              renderGoalCard(goal, {
                key: goal.id,
                archived: true,
              })
            )}
          </CollapsibleGoalSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
