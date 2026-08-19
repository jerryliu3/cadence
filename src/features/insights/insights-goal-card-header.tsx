import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { GoalEndMonthBadge } from "@/features/goals/goal-end-month-badge";

interface InsightsGoalCardHeaderProps {
  title: string;
  color: string;
  categoryLabel: string;
  categoryClassName: string;
  endDate: string | null;
  daysRemaining: number | null;
  action?: ReactNode;
}

export function InsightsGoalCardHeader({
  title,
  color,
  categoryLabel,
  categoryClassName,
  endDate,
  daysRemaining,
  action,
}: InsightsGoalCardHeaderProps) {
  return (
    <div
      data-testid="insights-goal-card-header"
      className="flex flex-wrap items-start justify-between gap-2"
    >
      <div
        data-testid="insights-goal-card-title-line"
        className="flex min-w-0 flex-1 items-center gap-1.5"
      >
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <p className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-semibold leading-tight">
          {title}
        </p>
      </div>
      {action ? (
        <div className="flex shrink-0 items-center justify-end">{action}</div>
      ) : null}
      <div
        data-testid="insights-goal-card-meta-line"
        className="flex w-full flex-wrap items-center gap-1.5"
      >
        <Badge
          variant="outline"
          className={`w-fit ${categoryClassName}`}
        >
          {categoryLabel}
        </Badge>
        <GoalEndMonthBadge endDate={endDate} />
        {daysRemaining !== null ? (
          <Badge
            variant="outline"
            className="h-5 rounded-md border-amber-200 bg-amber-100 px-1.5 font-medium text-[11px] text-amber-900 dark:border-amber-200 dark:bg-amber-100 dark:text-amber-900"
            title="Days remaining to goal deadline"
            aria-label={`Days remaining ${daysRemaining}`}
          >
            Days remaining: {daysRemaining}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
