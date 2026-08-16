"use client";

import { Link2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CompletionToggle } from "@/components/ui/completion-toggle";
import { getCategoryBadgeClass, getGoalCategoryLabel } from "@/lib/goals/category";
import type { GoalProgressSnapshot } from "@/lib/goals/progress";
import {
  getFrequencySummary,
  isGoalDoneForCurrentPeriod,
} from "@/lib/goals/schedule";
import type { CompletionDateFact, Goal } from "@/lib/goals/types";
import { isTargetedRecurringGoal } from "@/lib/planner/requirements";
import { cn } from "@/lib/utils";

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
}
type GoalCardInteractionProps =
  | {
      readOnly: true;
      onToggle?: never;
    }
  | {
      readOnly?: false;
      onToggle: (sourceElement: HTMLButtonElement) => void;
    };

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
  readOnly = false,
  onToggle,
}: GoalCardProps & GoalCardInteractionProps) {
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
  const completionSourceForSelectedDate = completions.find(
    (completion) => completion.completed_on === selectedDate
  )?.source;
  const goalCategoryLabel = getGoalCategoryLabel(
    goal.category,
    goal.category_key
  );

  const body = (
    <>
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
          <Badge
            variant="outline"
            className={`h-5 shrink-0 rounded-md px-1.5 text-[11px] font-semibold ${getCategoryBadgeClass(
              goal.category_key ?? goal.category
            )}`}
          >
            {goalCategoryLabel}
          </Badge>
          <h3 className="truncate text-sm font-semibold">{goal.title}</h3>
          {progress?.outcome === "ended_with_shortfall" ? (
            <Badge variant="outline">Shortfall</Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <p className="truncate">{getFrequencySummary(goal, displayCompletionCount)}</p>
          {linkedCount > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Link2 className="size-3" />
              {linkedCount} linked
            </span>
          ) : null}
          {completionSourceForSelectedDate === "linked_cascade" ? (
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              Linked
            </Badge>
          ) : null}
        </div>
      </div>
    </>
  );


  return (
    <Card
      className={cn(
        "shadow-sm",
        progress?.outcome === "achieved" &&
          "border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/40"
      )}
    >
      <CardContent className="flex items-center gap-2 px-2 py-0.5">
        {readOnly ? (
          <span
            aria-hidden
            className={`size-4 shrink-0 rounded-full border ${
              doneForCurrentPeriod
                ? "border-primary bg-primary"
                : "border-muted-foreground/40 bg-transparent"
            }`}
          />
        ) : (
          <CompletionToggle
            completed={doneForCurrentPeriod}
            pending={disabled && !archived}
            size="lg"
            onClick={(event) => onToggle?.(event.currentTarget)}
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
        )}

        {readOnly ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-0.5 py-0.5">
            {body}
          </div>
        ) : (
          <Link
            href={`/goals/${goal.id}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-0.5 py-0.5 transition-colors hover:bg-muted/40"
          >
            {body}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
