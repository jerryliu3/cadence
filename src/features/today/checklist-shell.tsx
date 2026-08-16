"use client";

import { useMemo, useState } from "react";
import { ChecklistSurface } from "@/features/today/checklist-surface";
import { DuoLanes } from "@/features/social/duo/duo-lanes";
import { useDuoSurface } from "@/features/social/duo/use-duo-surface";
import {
  ALL_CATEGORIES_FILTER_VALUE,
  type ChecklistSharedFilters,
} from "@/features/today/today-tab";
import { toLocalDateString } from "@/lib/dates/day";
import type { RecurrenceFilter } from "@/features/today/checklist-selectors";
import type { GoalDateSort } from "@/lib/goals/list-view";

export function ChecklistShell() {
  const { scope, activePartner, viewer, partner } = useDuoSurface("checklist");
  const [viewDate, setViewDate] = useState(toLocalDateString());
  const [showPastGoals, setShowPastGoals] = useState(false);
  const [showUpcomingGoals, setShowUpcomingGoals] = useState(false);
  const [showArchivedGoals, setShowArchivedGoals] = useState(false);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_FILTER_VALUE);
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceFilter>("all");
  const [todayGoalSearchQuery, setTodayGoalSearchQuery] = useState("");
  const [todayEndMonth, setTodayEndMonth] = useState<string | null>(null);
  const [todaySort, setTodaySort] = useState<GoalDateSort>("earliest_end");
  const shareFilters = scope === "both" && Boolean(activePartner);
  const sharedFilters = useMemo<ChecklistSharedFilters | undefined>(
    () =>
      shareFilters
        ? {
            viewDate,
            setViewDate,
            showPastGoals,
            setShowPastGoals,
            showUpcomingGoals,
            setShowUpcomingGoals,
            showArchivedGoals,
            setShowArchivedGoals,
            showCompletedGoals,
            setShowCompletedGoals,
            categoryFilter,
            setCategoryFilter,
            recurrenceFilter,
            setRecurrenceFilter,
            todayGoalSearchQuery,
            setTodayGoalSearchQuery,
            todayEndMonth,
            setTodayEndMonth,
            todaySort,
            setTodaySort,
          }
        : undefined,
    [
      categoryFilter,
      recurrenceFilter,
      shareFilters,
      showArchivedGoals,
      showCompletedGoals,
      showPastGoals,
      showUpcomingGoals,
      todayEndMonth,
      todayGoalSearchQuery,
      todaySort,
      viewDate,
    ]
  );

  return (
    <div className="space-y-5">
      <DuoLanes
        scope={scope}
        viewer={viewer}
        partner={partner}
        renderLane={(subject) => (
          <ChecklistSurface
            isActive
            subjectUserId={subject.userId}
            readOnly={subject.readOnly}
            sharedFilters={sharedFilters}
          />
        )}
      />
    </div>
  );
}
