import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { GoalEndMonthBadge } from "@/features/goals/goal-end-month-badge";

interface InsightsGoalCardHeaderProps {
  title: string;
  color: string;
  categoryLabel: string;
  categoryClassName: string;
  endDate: string | null;
  action?: ReactNode;
}

export function InsightsGoalCardHeader({
  title,
  color,
  categoryLabel,
  categoryClassName,
  endDate,
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
      </div>
    </div>
  );
}
