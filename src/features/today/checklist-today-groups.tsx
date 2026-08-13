"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { GoalLoopScroller } from "@/features/today/goal-loop-scroller";
import {
  VISIBLE_GOALS_PER_GROUP,
  type RecurrenceFilter,
  type RecurrenceGroup,
} from "@/features/today/checklist-selectors";
import type { Goal } from "@/lib/goals/types";

export function ChecklistTodayGroups({
  recurrenceFilter,
  groups,
  sortedGoals,
  expandedGroups,
  onToggleGroup,
  renderGoal,
}: {
  recurrenceFilter: RecurrenceFilter;
  groups: Array<{ key: RecurrenceGroup; label: string; goals: Goal[] }>;
  sortedGoals: Goal[];
  expandedGroups: Record<RecurrenceGroup, boolean>;
  onToggleGroup: (group: RecurrenceGroup) => void;
  renderGoal: (goal: Goal, options?: { archived?: boolean; key?: string }) => ReactNode;
}) {
  if (sortedGoals.length === 0) {
    return (
      <Card className="shadow-none">
        <CardContent className="py-6 text-sm text-muted-foreground">
          No goals match these filters for this date.
        </CardContent>
      </Card>
    );
  }

  if (recurrenceFilter !== "all") {
    return (
      <div className="space-y-3">
        {sortedGoals.map((goal) => renderGoal(goal, { key: goal.id }))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
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
                    onClick={() => onToggleGroup(group.key)}
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
                  renderGoal={(goal) => renderGoal(goal)}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {group.goals.map((goal) => renderGoal(goal, { key: goal.id }))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
