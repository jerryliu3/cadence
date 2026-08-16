"use client";

import { Archive, CalendarClock, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsibleGoalSection } from "@/features/today/collapsible-goal-section";
import type { Goal } from "@/lib/goals/types";

export function ChecklistPastPanels({
  upcoming,
  pastGoals,
  archivedGoals,
  showUpcoming,
  showPast,
  showArchived,
  upcomingOpen,
  pastOpen,
  archiveOpen,
  onUpcomingOpenChange,
  onPastOpenChange,
  onArchiveOpenChange,
  renderGoal,
}: {
  upcoming: Goal[];
  pastGoals: Goal[];
  archivedGoals: Goal[];
  showUpcoming: boolean;
  showPast: boolean;
  showArchived: boolean;
  upcomingOpen: boolean;
  pastOpen: boolean;
  archiveOpen: boolean;
  onUpcomingOpenChange: (open: boolean) => void;
  onPastOpenChange: (open: boolean) => void;
  onArchiveOpenChange: (open: boolean) => void;
  renderGoal: (goal: Goal, options?: { archived?: boolean; key?: string }) => ReactNode;
}) {
  return (
    <>
      {showUpcoming ? (
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
      ) : null}

      {showPast ? (
        <CollapsibleGoalSection
          open={pastOpen}
          onOpenChange={onPastOpenChange}
          title="Past"
          count={pastGoals.length}
          icon={<CheckCircle2 className="size-4 text-muted-foreground" />}
          emptyMessage="No past goals yet."
        >
          {pastGoals.map((goal) => renderGoal(goal, { key: goal.id }))}
        </CollapsibleGoalSection>
      ) : null}

      {showArchived ? (
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
      ) : null}
    </>
  );
}
