"use client";

import { addDays, endOfMonth, endOfYear, format, parseISO, subDays } from "date-fns";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Link2,
  ListPlus,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  type ReactNode,
  type UIEventHandler,
  type WheelEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toLocalDateString } from "@/lib/dates/day";
import { getCategoryBadgeClass } from "@/lib/goals/category";
import {
  getCompletionsForCurrentPeriod,
  getFrequencySummary,
  getGoalPeriodEndDate,
  hasCompletionToday,
  isGoalCompleted,
  isGoalDoneForCurrentPeriod,
  isGoalManuallyArchived,
} from "@/lib/goals/schedule";
import type { Completion, Goal, GoalLink, GoalParticipant } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";

interface TodayData {
  userId: string;
  goals: Goal[];
  completions: Completion[];
  participants: GoalParticipant[];
  links: GoalLink[];
  photoUrls: Record<string, string>;
}

const emptyData: TodayData = {
  userId: "",
  goals: [],
  completions: [],
  participants: [],
  links: [],
  photoUrls: {},
};

const allCategoriesFilterValue = "__all_categories__";
type DeadlineFilter = "all_deadlines" | "this_month" | "this_year" | "custom_date";
type RecurrenceFilter = "all" | "daily" | "weekly" | "monthly" | "fixed";
type RecurrenceGroup = "daily" | "weekly" | "monthly" | "fixed";
const VISIBLE_GOALS_PER_GROUP = 5;
const INITIAL_GROUP_EXPANDED: Record<RecurrenceGroup, boolean> = {
  daily: false,
  weekly: false,
  monthly: false,
  fixed: false,
};

function getFrequencyRank(goal: Goal): number {
  if (goal.frequency_type === "fixed_milestones") {
    return 3;
  }

  if (goal.recurrence_interval === "weekly") {
    return 1;
  }

  if (goal.recurrence_interval === "monthly") {
    return 2;
  }

  return 0;
}

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

function goalCompletionsMap(completions: Completion[]) {
  const grouped = new Map<string, Completion[]>();
  completions.forEach((completion) => {
    const existing = grouped.get(completion.goal_id) ?? [];
    existing.push(completion);
    grouped.set(completion.goal_id, existing);
  });
  return grouped;
}

function getNextMilestoneName(goal: Goal, completionCount: number): string | null {
  if (goal.frequency_type !== "fixed_milestones") {
    return null;
  }

  const targetCount = goal.target_count ?? 0;
  if (targetCount <= 0 || completionCount >= targetCount) {
    return null;
  }

  const nextMilestoneIndex = completionCount;
  const customName = goal.milestone_names?.[nextMilestoneIndex]?.trim();
  if (customName && customName.length > 0) {
    return customName;
  }

  return `Milestone ${nextMilestoneIndex + 1}`;
}

export function TodayTab() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TodayData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] =
    useState<Record<RecurrenceGroup, boolean>>(INITIAL_GROUP_EXPANDED);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(allCategoriesFilterValue);
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("this_month");
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceFilter>("all");
  const [todayGoalSearchQuery, setTodayGoalSearchQuery] = useState("");
  const [viewDate, setViewDate] = useState(toLocalDateString());
  const [customDeadlineDate, setCustomDeadlineDate] = useState(toLocalDateString());

  const viewDateObj = useMemo(() => parseISO(viewDate), [viewDate]);
  const todayLocalDate = toLocalDateString();
  const viewingToday = viewDate === todayLocalDate;
  const normalizedTodayGoalSearchQuery = useMemo(
    () => todayGoalSearchQuery.trim().toLowerCase(),
    [todayGoalSearchQuery]
  );

  const loadData = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (showLoading) {
        setLoading(true);
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (showLoading) {
          setLoading(false);
        }
        setData(emptyData);
        return;
      }

      const [goalsResponse, completionsResponse, participantsResponse, linksResponse] =
        await Promise.all([
          supabase
            .from("goals")
            .select("*")
            .eq("is_deleted", false)
            .order("created_at", { ascending: false }),
          supabase.from("completions").select("*").eq("user_id", user.id),
          supabase.from("goal_participants").select("*").eq("user_id", user.id),
          supabase.from("goal_links").select("*").eq("owner_id", user.id),
        ]);

      const goals = (goalsResponse.data ?? []) as Goal[];
      const completions = (completionsResponse.data ?? []) as Completion[];
      const participants = (participantsResponse.data ?? []) as GoalParticipant[];
      const links = (linksResponse.data ?? []) as GoalLink[];

      const photoUrls: Record<string, string> = {};
      await Promise.all(
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
      );

      setData({
        userId: user.id,
        goals,
        completions,
        participants,
        links,
        photoUrls,
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

  const completionsByGoal = useMemo(
    () => goalCompletionsMap(data.completions),
    [data.completions]
  );

  const completableGoalIds = useMemo(() => {
    const ids = new Set<string>();
    data.goals.forEach((goal) => {
      if (goal.owner_id === data.userId) {
        ids.add(goal.id);
      }
    });
    data.participants.forEach((membership) => ids.add(membership.goal_id));
    return ids;
  }, [data.goals, data.participants, data.userId]);

  const activeGoals = useMemo(() => {
    return data.goals.filter((goal) => {
      if (!completableGoalIds.has(goal.id)) {
        return false;
      }
      const completionCount = (completionsByGoal.get(goal.id) ?? []).length;
      return !isGoalCompleted(goal, viewDateObj, completionCount) && !isGoalManuallyArchived(goal);
    });
  }, [completableGoalIds, completionsByGoal, data.goals, viewDateObj]);

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

  const sortGoals = useCallback((goals: Goal[]) => {
    return [...goals].sort((left, right) => {
      const frequencyRankDifference = getFrequencyRank(left) - getFrequencyRank(right);
      if (frequencyRankDifference !== 0) {
        return frequencyRankDifference;
      }

      if (
        left.frequency_type === "recurring" &&
        right.frequency_type === "recurring" &&
        left.recurrence_interval === right.recurrence_interval
      ) {
        const targetDifference = (right.target_count ?? 0) - (left.target_count ?? 0);
        if (targetDifference !== 0) {
          return targetDifference;
        }
      }

      return left.title.localeCompare(right.title);
    });
  }, []);

  const completedGoals = useMemo(() => {
    return sortGoals(
      data.goals.filter((goal) => {
        if (!completableGoalIds.has(goal.id)) {
          return false;
        }

        if (isGoalManuallyArchived(goal)) {
          return false;
        }

        const completionCount = (completionsByGoal.get(goal.id) ?? []).length;
        return isGoalCompleted(goal, viewDateObj, completionCount);
      })
    );
  }, [completableGoalIds, completionsByGoal, data.goals, sortGoals, viewDateObj]);

  const archivedGoals = useMemo(() => {
    return sortGoals(
      data.goals.filter((goal) => {
        if (!completableGoalIds.has(goal.id)) {
          return false;
        }

        return isGoalManuallyArchived(goal);
      })
    );
  }, [completableGoalIds, data.goals, sortGoals]);

  const todayDate = viewDate;
  const thisMonthCutoff = useMemo(
    () => format(endOfMonth(viewDateObj), "yyyy-MM-dd"),
    [viewDateObj]
  );

  const thisYearExactDeadline = useMemo(
    () => format(endOfYear(viewDateObj), "yyyy-MM-dd"),
    [viewDateObj]
  );

  const matchesFilters = useCallback(
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

      if (deadlineFilter === "all_deadlines") {
        return true;
      }

      if (deadlineFilter === "this_month") {
        if (!goal.end_date) {
          return false;
        }
        return goal.end_date <= thisMonthCutoff;
      }

      if (deadlineFilter === "this_year") {
        return goal.end_date === thisYearExactDeadline;
      }

      if (deadlineFilter === "custom_date") {
        if (!goal.end_date || !customDeadlineDate) {
          return false;
        }
        return goal.end_date <= customDeadlineDate;
      }

      if (!goal.end_date) {
        return false;
      }

      return true;
    },
    [
      categoryFilter,
      customDeadlineDate,
      deadlineFilter,
      recurrenceFilter,
      thisMonthCutoff,
      thisYearExactDeadline,
    ]
  );

  const filteredTodayGoals = useMemo(
    () =>
      activeGoals
        .filter((goal) => goal.start_date <= todayDate)
        .filter(matchesFilters)
        .filter((goal) =>
          normalizedTodayGoalSearchQuery.length === 0
            ? true
            : goal.title.toLowerCase().includes(normalizedTodayGoalSearchQuery)
        ),
    [activeGoals, matchesFilters, normalizedTodayGoalSearchQuery, todayDate]
  );

  const todayPendingGoalsRaw = useMemo(
    () =>
      filteredTodayGoals.filter((goal) => {
        const completions = completionsByGoal.get(goal.id) ?? [];
        return !isGoalDoneForCurrentPeriod(goal, completions, viewDateObj);
      }),
    [completionsByGoal, filteredTodayGoals, viewDateObj]
  );

  const todayCompletedGoalsRaw = useMemo(
    () =>
      filteredTodayGoals.filter((goal) => {
        const completions = completionsByGoal.get(goal.id) ?? [];
        return isGoalDoneForCurrentPeriod(goal, completions, viewDateObj);
      }),
    [completionsByGoal, filteredTodayGoals, viewDateObj]
  );

  const todayPendingGoalsSorted = useMemo(
    () => sortGoals(todayPendingGoalsRaw),
    [sortGoals, todayPendingGoalsRaw]
  );

  const todayCompletedGoalsSorted = useMemo(
    () => sortGoals(todayCompletedGoalsRaw),
    [sortGoals, todayCompletedGoalsRaw]
  );

  const todayGoalsSorted = useMemo(
    () => [...todayPendingGoalsSorted, ...todayCompletedGoalsSorted],
    [todayCompletedGoalsSorted, todayPendingGoalsSorted]
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
          goals: sortGoals(grouped[group]),
        }))
        .filter((group) => group.goals.length > 0);
    },
    [sortGoals]
  );

  const pendingGroupedTodayGoals = useMemo(
    () => (recurrenceFilter === "all" ? groupGoalsByRecurrence(todayPendingGoalsRaw) : []),
    [groupGoalsByRecurrence, recurrenceFilter, todayPendingGoalsRaw]
  );

  const completedGroupedTodayGoals = useMemo(
    () => (recurrenceFilter === "all" ? groupGoalsByRecurrence(todayCompletedGoalsRaw) : []),
    [groupGoalsByRecurrence, recurrenceFilter, todayCompletedGoalsRaw]
  );

  const groupedTodayGoalsForAll = useMemo(() => {
    const pendingByGroup = new Map<RecurrenceGroup, Goal[]>();
    const completedByGroup = new Map<RecurrenceGroup, Goal[]>();

    pendingGroupedTodayGoals.forEach((group) => {
      pendingByGroup.set(group.key, group.goals);
    });

    completedGroupedTodayGoals.forEach((group) => {
      completedByGroup.set(group.key, group.goals);
    });

    return recurrenceGroupOrder
      .map((groupKey) => {
        const pendingGoals = pendingByGroup.get(groupKey) ?? [];
        const completedGoals = completedByGroup.get(groupKey) ?? [];
        const goals = [...pendingGoals, ...completedGoals];

        return {
          key: groupKey,
          label: recurrenceGroupLabel[groupKey],
          goals,
        };
      })
      .filter((group) => group.goals.length > 0);
  }, [completedGroupedTodayGoals, pendingGroupedTodayGoals]);

  const upcoming = useMemo(
    () => sortGoals(activeGoals.filter((goal) => goal.start_date > todayDate)),
    [activeGoals, sortGoals, todayDate]
  );

  const toggleCompletion = async (goal: Goal) => {
    const completions = completionsByGoal.get(goal.id) ?? [];
    const completedOnViewDate = hasCompletionToday(completions, viewDateObj);
    const completionsInCurrentPeriod = getCompletionsForCurrentPeriod(goal, completions, viewDateObj);
    const completedForCurrentPeriod = completionsInCurrentPeriod.length > 0;
    const latestCompletionInCurrentPeriod = [...completionsInCurrentPeriod]
      .sort((left, right) => left.completed_on.localeCompare(right.completed_on))
      .at(-1);
    const completionToUnmark = completedOnViewDate
      ? completions.find((completion) => completion.completed_on === viewDate)
      : latestCompletionInCurrentPeriod;

    setSavingGoalId(goal.id);
    const currentScrollY = window.scrollY;

    try {
      if (completedForCurrentPeriod && completionToUnmark) {
        const unmarkDate = completionToUnmark.completed_on;
        const { error } = await supabase.rpc("unmark_goal_complete", {
          p_goal_id: goal.id,
          p_date: unmarkDate,
        });
        if (error) {
          toast.error(error.message);
        } else {
          toast.success(`Marked as incomplete for ${unmarkDate}.`);
        }
      } else {
        const { error } = await supabase.rpc("mark_goal_complete", {
          p_goal_id: goal.id,
          p_date: viewDate,
        });
        if (error) {
          toast.error(error.message);
        } else {
          toast.success(`Great work. Goal completed for ${viewDate}.`);
        }
      }

      await loadData({ showLoading: false });
      requestAnimationFrame(() => {
        window.scrollTo({ top: currentScrollY, behavior: "auto" });
      });
    } finally {
      setSavingGoalId(null);
    }
  };

  const goToPreviousDate = () => {
    setViewDate((previous) => format(subDays(parseISO(previous), 1), "yyyy-MM-dd"));
  };

  const goToNextDate = () => {
    setViewDate((previous) => format(addDays(parseISO(previous), 1), "yyyy-MM-dd"));
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading your goals...</CardTitle>
          <CardDescription>Pulling your latest progress from Supabase.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <CardTitle className="text-xl">Today</CardTitle>
                </div>
                <CardDescription>{format(viewDateObj, "EEEE, MMMM d")}</CardDescription>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:mr-2 sm:flex-row">
                <Button variant="outline" asChild>
                  <Link href="/goals/bulk">
                    <ListPlus className="size-4" />
                    New bulk goal
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/goals/new">
                    <Plus className="size-4" />
                    New goal
                  </Link>
                </Button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" size="icon-sm" onClick={goToPreviousDate}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Input
                  type="date"
                  value={viewDate}
                  onChange={(event) => setViewDate(event.target.value || todayLocalDate)}
                  className="h-8 w-[170px]"
                />
                <Button type="button" variant="outline" size="icon-sm" onClick={goToNextDate}>
                  <ChevronRight className="size-4" />
                </Button>
                {!viewingToday ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewDate(todayLocalDate)}
                  >
                    Today
                  </Button>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-8 w-[170px] rounded-full bg-background/90 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allCategoriesFilterValue}>All Categories</SelectItem>
                    {availableCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={deadlineFilter}
                  onValueChange={(value: DeadlineFilter) => setDeadlineFilter(value)}
                >
                  <SelectTrigger className="h-8 w-[170px] rounded-full bg-background/90 text-xs">
                    <SelectValue placeholder="Deadline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_deadlines">All Deadlines</SelectItem>
                    <SelectItem value="this_month">Monthly Deadline</SelectItem>
                    <SelectItem value="this_year">Yearly Deadline</SelectItem>
                    <SelectItem value="custom_date">Custom Deadline</SelectItem>
                  </SelectContent>
                </Select>

                {deadlineFilter === "custom_date" ? (
                  <Input
                    type="date"
                    value={customDeadlineDate}
                    onChange={(event) => setCustomDeadlineDate(event.target.value)}
                    className="h-8 w-[170px] rounded-full text-xs"
                  />
                ) : null}

                <Select
                  value={recurrenceFilter}
                  onValueChange={(value: RecurrenceFilter) => setRecurrenceFilter(value)}
                >
                  <SelectTrigger className="h-8 w-[190px] rounded-full bg-background/90 text-xs">
                    <SelectValue placeholder="Recurrence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Recurrences</SelectItem>
                    <SelectItem value="daily">Daily Recurrences</SelectItem>
                    <SelectItem value="weekly">Weekly Recurrences</SelectItem>
                    <SelectItem value="monthly">Monthly Recurrences</SelectItem>
                    <SelectItem value="fixed">Milestone Goals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
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
                          renderGoal={(goal) => (
                            <GoalCard
                              goal={goal}
                              completions={completionsByGoal.get(goal.id) ?? []}
                              linkedCount={
                                data.links.filter((link) => link.source_goal_id === goal.id).length
                              }
                              imageUrl={data.photoUrls[goal.id]}
                              disabled={savingGoalId === goal.id}
                              selectedDate={viewDate}
                              referenceDate={viewDateObj}
                              onToggle={() => toggleCompletion(goal)}
                            />
                          )}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {group.goals.map((goal) => (
                          <GoalCard
                            key={goal.id}
                            goal={goal}
                            completions={completionsByGoal.get(goal.id) ?? []}
                            linkedCount={data.links.filter((link) => link.source_goal_id === goal.id).length}
                            imageUrl={data.photoUrls[goal.id]}
                            disabled={savingGoalId === goal.id}
                            selectedDate={viewDate}
                            referenceDate={viewDateObj}
                            onToggle={() => toggleCompletion(goal)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {todayGoalsSorted.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  completions={completionsByGoal.get(goal.id) ?? []}
                  linkedCount={data.links.filter((link) => link.source_goal_id === goal.id).length}
                  imageUrl={data.photoUrls[goal.id]}
                  disabled={savingGoalId === goal.id}
                  selectedDate={viewDate}
                  referenceDate={viewDateObj}
                  onToggle={() => toggleCompletion(goal)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Collapsible open={upcomingOpen} onOpenChange={setUpcomingOpen}>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">Upcoming</CardTitle>
                <Badge variant="secondary">{upcoming.length}</Badge>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  {upcomingOpen ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No future goals yet.</p>
              ) : (
                upcoming.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    completions={completionsByGoal.get(goal.id) ?? []}
                    linkedCount={data.links.filter((link) => link.source_goal_id === goal.id).length}
                    imageUrl={data.photoUrls[goal.id]}
                    disabled={savingGoalId === goal.id}
                    selectedDate={viewDate}
                    referenceDate={viewDateObj}
                    onToggle={() => toggleCompletion(goal)}
                  />
                ))
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">Completed</CardTitle>
                <Badge variant="secondary">{completedGoals.length}</Badge>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  {completedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              {completedGoals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed goals yet.</p>
              ) : (
                completedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    completions={completionsByGoal.get(goal.id) ?? []}
                    linkedCount={data.links.filter((link) => link.source_goal_id === goal.id).length}
                    imageUrl={data.photoUrls[goal.id]}
                    disabled={savingGoalId === goal.id}
                    selectedDate={viewDate}
                    referenceDate={viewDateObj}
                    onToggle={() => toggleCompletion(goal)}
                  />
                ))
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen}>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">Archived</CardTitle>
                <Badge variant="secondary">{archivedGoals.length}</Badge>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  {archiveOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              {archivedGoals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No archived goals yet.</p>
              ) : (
                archivedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    completions={completionsByGoal.get(goal.id) ?? []}
                    linkedCount={data.links.filter((link) => link.source_goal_id === goal.id).length}
                    imageUrl={data.photoUrls[goal.id]}
                    disabled
                    archived
                    selectedDate={viewDate}
                    referenceDate={viewDateObj}
                    onToggle={() => undefined}
                  />
                ))
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

interface GoalLoopScrollerProps {
  goals: Goal[];
  renderGoal: (goal: Goal, repeatIndex: number) => ReactNode;
}

function GoalLoopScroller({ goals, renderGoal }: GoalLoopScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const shouldLoop = goals.length > VISIBLE_GOALS_PER_GROUP;
  const repeatedGoals = useMemo(() => {
    if (!shouldLoop) {
      return goals;
    }

    return [...goals, ...goals, ...goals];
  }, [goals, shouldLoop]);
  const [cycleProgress, setCycleProgress] = useState(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    if (!shouldLoop) {
      scroller.scrollTop = 0;
      setCycleProgress(0);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const oneCycleHeight = scroller.scrollHeight / 3;
      if (oneCycleHeight > 0) {
        scroller.scrollTop = oneCycleHeight;
      }
      setCycleProgress(0);
    });

    return () => cancelAnimationFrame(frameId);
  }, [goals, shouldLoop]);

  const onScroll = useCallback<UIEventHandler<HTMLDivElement>>(
    (event) => {
      if (!shouldLoop) {
        return;
      }

      const scroller = event.currentTarget;
      const oneCycleHeight = scroller.scrollHeight / 3;
      if (oneCycleHeight <= 0) {
        return;
      }

      let nextScrollTop = scroller.scrollTop;
      if (nextScrollTop <= oneCycleHeight * 0.5) {
        nextScrollTop += oneCycleHeight;
        scroller.scrollTop = nextScrollTop;
      } else if (nextScrollTop >= oneCycleHeight * 2.5) {
        nextScrollTop -= oneCycleHeight;
        scroller.scrollTop = nextScrollTop;
      }

      const normalized =
        ((nextScrollTop - oneCycleHeight) % oneCycleHeight + oneCycleHeight) % oneCycleHeight;
      setCycleProgress(normalized / oneCycleHeight);
    },
    [shouldLoop]
  );

  const onWheel = useCallback<WheelEventHandler<HTMLDivElement>>(
    (event) => {
      if (!shouldLoop) {
        return;
      }

      event.preventDefault();
      const scroller = event.currentTarget;
      scroller.scrollTop += event.deltaY;
    },
    [shouldLoop]
  );

  const thumbHeightPercent = shouldLoop
    ? Math.max((VISIBLE_GOALS_PER_GROUP / goals.length) * 100, 14)
    : 100;
  const thumbTopPercent = shouldLoop ? (100 - thumbHeightPercent) * cycleProgress : 0;
  const loopingSoon = shouldLoop && (cycleProgress <= 0.08 || cycleProgress >= 0.92);

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        data-no-swipe="true"
        className="h-[430px] overflow-y-scroll overscroll-contain pr-4 [scrollbar-width:thin] [touch-action:pan-y]"
        onScroll={onScroll}
        onWheel={onWheel}
      >
        <div className="space-y-3 pr-1">
          {repeatedGoals.map((goal, repeatIndex) => {
            const goalCount = Math.max(goals.length, 1);
            const cycleIndex = Math.floor(repeatIndex / goalCount);
            const inCycleIndex = repeatIndex % goalCount;
            return (
              <div key={`${goal.id}-${cycleIndex}-${inCycleIndex}`}>{renderGoal(goal, repeatIndex)}</div>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-2 right-0 top-2 w-2.5">
        <div className="relative h-full rounded-full bg-border/60">
          <div
            className="absolute left-0 right-0 rounded-full bg-primary/70 transition-[top] duration-150"
            style={{ height: `${thumbHeightPercent}%`, top: `${thumbTopPercent}%` }}
          />
        </div>
      </div>

      {shouldLoop ? (
        <div className="pointer-events-none absolute bottom-0 right-4 text-[10px] text-muted-foreground">
          {loopingSoon ? "Looping around" : "Scroll inside list"}
        </div>
      ) : null}
    </div>
  );
}

interface GoalCardProps {
  goal: Goal;
  completions: Completion[];
  linkedCount: number;
  imageUrl?: string;
  selectedDate: string;
  referenceDate: Date;
  disabled?: boolean;
  archived?: boolean;
  onToggle: () => void;
}

function GoalCard({
  goal,
  completions,
  linkedCount,
  imageUrl,
  selectedDate,
  referenceDate,
  disabled = false,
  archived = false,
  onToggle,
}: GoalCardProps) {
  const totalCompletionCount = completions.length;
  const recurringPeriodCompletionCount = getCompletionsForCurrentPeriod(
    goal,
    completions,
    referenceDate
  ).length;
  const displayCompletionCount =
    goal.frequency_type === "recurring" ? recurringPeriodCompletionCount : totalCompletionCount;
  const doneForCurrentPeriod = isGoalDoneForCurrentPeriod(goal, completions, referenceDate);
  const doneOnSelectedDate = hasCompletionToday(completions, referenceDate);
  const currentMilestoneName = getNextMilestoneName(goal, totalCompletionCount);
  const nextRecurringStartDate =
    goal.frequency_type === "recurring" && doneForCurrentPeriod
      ? format(addDays(getGoalPeriodEndDate(goal, referenceDate), 1), "yyyy-MM-dd")
      : null;
  const completionSourceForSelectedDate = completions.find(
    (completion) => completion.completed_on === selectedDate
  )?.source;

  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-2 px-2 py-0.5">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled || archived}
          className="group flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-all hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={
            doneForCurrentPeriod
              ? "Unmark goal completion for current period"
              : "Mark goal as complete"
          }
        >
          {doneForCurrentPeriod ? (
            <CheckCircle2 className="size-5 text-primary transition-transform group-hover:scale-110" />
          ) : (
            <Circle className="size-5 text-muted-foreground transition-transform group-hover:scale-110" />
          )}
        </button>

        <Link
          href={`/goals/${goal.id}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-0.5 py-0.5 transition-colors hover:bg-muted/40"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={goal.title}
              width={48}
              height={48}
              unoptimized
              className="size-12 rounded-lg object-cover ring-1 ring-border"
            />
          ) : null}

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: goal.color ?? "var(--muted-foreground)" }}
              />
              <h3 className="truncate text-sm font-semibold">{goal.title}</h3>
              <Badge variant="outline" className={getCategoryBadgeClass(goal.category)}>
                {goal.category}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex min-w-0 items-center gap-2">
                {currentMilestoneName ? (
                  <>
                    <span className="max-w-[180px] truncate">
                      Current milestone: {currentMilestoneName}
                    </span>
                    <span className="shrink-0">·</span>
                  </>
                ) : null}
                <p className="truncate">{getFrequencySummary(goal, displayCompletionCount)}</p>
                {nextRecurringStartDate ? <span className="shrink-0">·</span> : null}
              </div>
              {nextRecurringStartDate ? (
                <span className="shrink-0">Next Start Date: {nextRecurringStartDate}</span>
              ) : null}
              <span className="ml-auto shrink-0 text-[11px]">
                Deadline: {goal.end_date ?? "None"}
              </span>
            </div>
            {goal.description ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{goal.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {linkedCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Link2 className="size-3" />
                  {linkedCount} linked
                </span>
              ) : null}
              {completionSourceForSelectedDate === "linked_cascade" ? (
                <Badge variant="outline">Auto-completed via link</Badge>
              ) : null}
              {doneForCurrentPeriod && !doneOnSelectedDate ? (
                <span>Current period done</span>
              ) : null}
            </div>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
