"use client";

import { useMemo, useState } from "react";
import { ChecklistSurface } from "@/features/today/checklist-surface";
import { DuoLanes } from "@/features/social/duo/duo-lanes";
import { useDuoSurface } from "@/features/social/duo/use-duo-surface";
import {
  type ChecklistSharedFilters,
} from "@/features/today/today-tab";
import { toLocalDateString } from "@/lib/dates/day";
import type { RecurrenceGroup } from "@/features/today/checklist-selectors";
import type { GoalDateSort } from "@/lib/goals/list-view";

export function ChecklistShell() {
  const { scope, activePartner, viewer, partner } = useDuoSurface("checklist");
  const [viewDate, setViewDate] = useState(toLocalDateString());
  const [showPastGoals, setShowPastGoals] = useState(false);
  const [showUpcomingGoals, setShowUpcomingGoals] = useState(false);
  const [showArchivedGoals, setShowArchivedGoals] = useState(false);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [recurrenceFilters, setRecurrenceFilters] = useState<RecurrenceGroup[]>([]);
  const [todayGoalSearchQuery, setTodayGoalSearchQuery] = useState("");
  const [todayEndMonths, setTodayEndMonths] = useState<string[]>([]);
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
            categoryFilters,
            setCategoryFilters,
            recurrenceFilters,
            setRecurrenceFilters,
            todayGoalSearchQuery,
            setTodayGoalSearchQuery,
            todayEndMonths,
            setTodayEndMonths,
            todaySort,
            setTodaySort,
          }
        : undefined,
    [
      categoryFilters,
      recurrenceFilters,
      shareFilters,
      showArchivedGoals,
      showCompletedGoals,
      showPastGoals,
      showUpcomingGoals,
      todayEndMonths,
      todayGoalSearchQuery,
      todaySort,
      viewDate,
    ]
  );

  return (
    <div className="space-y-5">
      {shareFilters ? (
        <>
          <div className="mx-auto w-full md:max-w-3xl">
            <ChecklistSurface
              isActive
              sharedFilters={sharedFilters}
              contentMode="filters-only"
            />
          </div>
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
                showFiltersSection={false}
                contentMode="goals-only"
              />
            )}
          />
        </>
      ) : (
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
      )}
    </div>
  );
}
