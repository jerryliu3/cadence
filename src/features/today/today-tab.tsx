"use client";

import { format } from "date-fns";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Link2,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { toLocalDateString } from "@/lib/dates/day";
import { getCategoryBadgeClass } from "@/lib/goals/category";
import {
  getFrequencySummary,
  hasCompletionToday,
  isGoalArchived,
  isGoalDoneForCurrentPeriod,
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

function goalCompletionsMap(completions: Completion[]) {
  const grouped = new Map<string, Completion[]>();
  completions.forEach((completion) => {
    const existing = grouped.get(completion.goal_id) ?? [];
    existing.push(completion);
    grouped.set(completion.goal_id, existing);
  });
  return grouped;
}

export function TodayTab() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TodayData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      setData(emptyData);
      return;
    }

    const [goalsResponse, completionsResponse, participantsResponse, linksResponse] =
      await Promise.all([
        supabase.from("goals").select("*").order("created_at", { ascending: false }),
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
    setLoading(false);
  }, [supabase]);

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
      const count = completionsByGoal.get(goal.id)?.length ?? 0;
      return !isGoalArchived(goal, count);
    });
  }, [completableGoalIds, completionsByGoal, data.goals]);

  const archivedGoals = useMemo(() => {
    return data.goals.filter((goal) => {
      if (!completableGoalIds.has(goal.id)) {
        return false;
      }
      const count = completionsByGoal.get(goal.id)?.length ?? 0;
      return isGoalArchived(goal, count);
    });
  }, [completableGoalIds, completionsByGoal, data.goals]);

  const dueToday = useMemo(
    () =>
      activeGoals.filter((goal) => {
        const completions = completionsByGoal.get(goal.id) ?? [];
        return !isGoalDoneForCurrentPeriod(goal, completions);
      }),
    [activeGoals, completionsByGoal]
  );

  const upcoming = useMemo(
    () =>
      activeGoals.filter((goal) => {
        const completions = completionsByGoal.get(goal.id) ?? [];
        return isGoalDoneForCurrentPeriod(goal, completions);
      }),
    [activeGoals, completionsByGoal]
  );

  const currentPeriodProgress = useMemo(() => {
    if (activeGoals.length === 0) {
      return 0;
    }
    const done = activeGoals.filter((goal) => {
      const completions = completionsByGoal.get(goal.id) ?? [];
      return isGoalDoneForCurrentPeriod(goal, completions);
    }).length;

    return (done / activeGoals.length) * 100;
  }, [activeGoals, completionsByGoal]);

  const toggleCompletion = async (goal: Goal) => {
    const completions = completionsByGoal.get(goal.id) ?? [];
    const completedToday = hasCompletionToday(completions);
    setSavingGoalId(goal.id);

    if (completedToday) {
      const { error } = await supabase.rpc("unmark_goal_complete", {
        p_goal_id: goal.id,
        p_date: toLocalDateString(),
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Marked as incomplete for today.");
      }
    } else {
      const { error } = await supabase.rpc("mark_goal_complete", {
        p_goal_id: goal.id,
        p_date: toLocalDateString(),
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Great work. Goal completed for today.");
      }
    }

    await loadData();
    setSavingGoalId(null);
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Today</CardTitle>
              <CardDescription>{format(new Date(), "EEEE, MMMM d")}</CardDescription>
            </div>
            <Button asChild>
              <Link href="/goals/new">
                <Plus className="size-4" />
                New goal
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current period progress</span>
            <span>{Math.round(currentPeriodProgress)}%</span>
          </div>
          <Progress value={currentPeriodProgress} />
          <p className="text-xs text-muted-foreground">
            Un-marking removes only this goal&apos;s completion for today and does not cascade.
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Due now
          </h2>
        </div>
        {dueToday.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Nothing due right now. Add a goal or check your upcoming list.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {dueToday.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                completions={completionsByGoal.get(goal.id) ?? []}
                linkedCount={data.links.filter((link) => link.source_goal_id === goal.id).length}
                imageUrl={data.photoUrls[goal.id]}
                disabled={savingGoalId === goal.id}
                onToggle={() => toggleCompletion(goal)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming
          </h2>
        </div>
        {upcoming.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-6 text-sm text-muted-foreground">
              No goals in the upcoming section.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcoming.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                completions={completionsByGoal.get(goal.id) ?? []}
                linkedCount={data.links.filter((link) => link.source_goal_id === goal.id).length}
                imageUrl={data.photoUrls[goal.id]}
                disabled={savingGoalId === goal.id}
                onToggle={() => toggleCompletion(goal)}
              />
            ))}
          </div>
        )}
      </section>

      <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen}>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">Completed & archived</CardTitle>
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

interface GoalCardProps {
  goal: Goal;
  completions: Completion[];
  linkedCount: number;
  imageUrl?: string;
  disabled?: boolean;
  archived?: boolean;
  onToggle: () => void;
}

function GoalCard({
  goal,
  completions,
  linkedCount,
  imageUrl,
  disabled = false,
  archived = false,
  onToggle,
}: GoalCardProps) {
  const completionCount = completions.length;
  const doneForCurrentPeriod = isGoalDoneForCurrentPeriod(goal, completions);
  const doneToday = hasCompletionToday(completions);
  const completionSourceToday = completions.find(
    (completion) => completion.completed_on === toLocalDateString()
  )?.source;

  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-3 py-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled || archived}
          className="group flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-all hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={doneToday ? "Unmark goal completion for today" : "Mark goal as complete"}
        >
          {doneToday ? (
            <CheckCircle2 className="size-6 text-primary transition-transform group-hover:scale-110" />
          ) : (
            <Circle className="size-6 text-muted-foreground transition-transform group-hover:scale-110" />
          )}
        </button>

        <Link
          href={`/goals/${goal.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-muted/40"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={goal.title}
              width={56}
              height={56}
              unoptimized
              className="size-14 rounded-xl object-cover ring-1 ring-border"
            />
          ) : null}

          <div className="min-w-0 flex-1 space-y-1">
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
            <p className="text-xs text-muted-foreground">
              {getFrequencySummary(goal, completionCount)}
            </p>
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
              {completionSourceToday === "linked_cascade" ? (
                <Badge variant="outline">Auto-completed via link</Badge>
              ) : null}
              {goal.end_date ? <span>Ends {goal.end_date}</span> : <span>No end date</span>}
              {doneForCurrentPeriod && !doneToday ? (
                <span>Current period done</span>
              ) : null}
            </div>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
