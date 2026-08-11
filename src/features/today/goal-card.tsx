"use client";

import { addDays, format } from "date-fns";
import { Link2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CompletionToggle } from "@/components/ui/completion-toggle";
import { GoalEndMonthBadge } from "@/features/goals/goal-end-month-badge";
import { getCategoryBadgeClass } from "@/lib/goals/category";
import { getNextMilestoneName } from "@/lib/goals/milestones";
import type { GoalProgressSnapshot } from "@/lib/goals/progress";
import {
  getFrequencySummary,
  getGoalPeriodEndDate,
  hasCompletionToday,
  isGoalDoneForCurrentPeriod,
} from "@/lib/goals/schedule";
import type { CompletionDateFact, Goal } from "@/lib/goals/types";
import { isTargetedRecurringGoal } from "@/lib/planner/requirements";

interface GoalCardProps {
  goal: Goal;
  completions: CompletionDateFact[];
  progress?: GoalProgressSnapshot;
  linkedCount: number;
  imageUrl?: string;
  selectedDate: string;
  referenceDate: Date;
  weeklyAnchor: {
    weekStartsOn: number;
  };
  disabled?: boolean;
  archived?: boolean;
  onToggle: (sourceElement: HTMLButtonElement) => void;
}

export function GoalCard({
  goal,
  completions,
  progress,
  linkedCount,
  imageUrl,
  selectedDate,
  referenceDate,
  weeklyAnchor,
  disabled = false,
  archived = false,
  onToggle,
}: GoalCardProps) {
  const totalCompletionCount =
    progress?.admissibleCompletionCount ?? completions.length;
  const displayCompletionCount = totalCompletionCount;
  const targetedRecurring = isTargetedRecurringGoal(goal);
  const doneForCurrentPeriod = isGoalDoneForCurrentPeriod(
    goal,
    completions,
    referenceDate,
    { weeklyAnchor }
  );
  const doneOnSelectedDate = hasCompletionToday(completions, referenceDate);
  const currentMilestoneName = getNextMilestoneName(goal, totalCompletionCount);
  const nextRecurringStartDate =
    goal.frequency_type === "recurring" &&
    !targetedRecurring &&
    doneForCurrentPeriod
      ? format(
          addDays(
            getGoalPeriodEndDate(goal, referenceDate, { weeklyAnchor }),
            1
          ),
          "yyyy-MM-dd"
        )
      : null;
  const completionSourceForSelectedDate = completions.find(
    (completion) => completion.completed_on === selectedDate
  )?.source;

  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-2 px-2 py-0.5">
        <CompletionToggle
          completed={doneForCurrentPeriod}
          size="lg"
          onClick={(event) => onToggle(event.currentTarget)}
          disabled={disabled || archived}
          aria-label={
            doneForCurrentPeriod
              ? targetedRecurring
                ? `Remove completion for ${selectedDate}`
                : "Unmark goal completion for current period"
              : targetedRecurring
                ? `Complete goal for ${selectedDate}`
                : "Mark goal as complete"
          }
        />

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
              <GoalEndMonthBadge endDate={goal.end_date} />
              <Badge variant="outline" className={getCategoryBadgeClass(goal.category)}>
                {goal.category}
              </Badge>
              {progress?.outcome === "achieved" ? (
                <Badge variant="secondary">Achieved</Badge>
              ) : progress?.outcome === "ended_with_shortfall" ? (
                <Badge variant="outline">Shortfall</Badge>
              ) : null}
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
              {!targetedRecurring && doneForCurrentPeriod && !doneOnSelectedDate ? (
                <span>Current period done</span>
              ) : null}
            </div>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
