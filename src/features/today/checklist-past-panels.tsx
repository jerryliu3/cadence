"use client";

import { Archive, CalendarClock, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsibleGoalSection } from "@/features/today/collapsible-goal-section";
import type { Goal } from "@/lib/goals/types";

export function ChecklistPastPanels({
  upcoming,
  completedGoals,
  archivedGoals,
  upcomingOpen,
  completedOpen,
  archiveOpen,
  onUpcomingOpenChange,
  onCompletedOpenChange,
  onArchiveOpenChange,
  renderGoal,
}: {
  upcoming: Goal[];
  completedGoals: Goal[];
  archivedGoals: Goal[];
  upcomingOpen: boolean;
  completedOpen: boolean;
  archiveOpen: boolean;
  onUpcomingOpenChange: (open: boolean) => void;
  onCompletedOpenChange: (open: boolean) => void;
  onArchiveOpenChange: (open: boolean) => void;
  renderGoal: (goal: Goal, options?: { archived?: boolean; key?: string }) => ReactNode;
}) {
  return (
    <>
      <CollapsibleGoalSection
        open={upcomingOpen}
        onOpenChange={onUpcomingOpenChange}
        title="Upcoming"
        count={upcoming.length}
        icon={<CalendarClock className="size-4 text-muted-foreground" />}
        emptyMessage="No future goals yet."
      >
        {upcoming.map((goal) => renderGoal(goal, { key: goal.id }))}
      </CollapsibleGoalSection>

      <CollapsibleGoalSection
        open={completedOpen}
        onOpenChange={onCompletedOpenChange}
        title="Ended"
        count={completedGoals.length}
        icon={<CheckCircle2 className="size-4 text-muted-foreground" />}
        emptyMessage="No ended goals yet."
      >
        {completedGoals.map((goal) => renderGoal(goal, { key: goal.id }))}
      </CollapsibleGoalSection>

      <CollapsibleGoalSection
        open={archiveOpen}
        onOpenChange={onArchiveOpenChange}
        title="Archived"
        count={archivedGoals.length}
        icon={<Archive className="size-4 text-muted-foreground" />}
        emptyMessage="No archived goals yet."
      >
        {archivedGoals.map((goal) =>
          renderGoal(goal, {
            key: goal.id,
            archived: true,
          })
        )}
      </CollapsibleGoalSection>
    </>
  );
}
