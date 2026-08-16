"use client";

import { useMemo, useState } from "react";
import { DuoLanes } from "@/features/social/duo/duo-lanes";
import { useDuoSurface } from "@/features/social/duo/use-duo-surface";
import { InsightsPeriodControls } from "@/features/insights/insights-period-controls";
import {
  InsightsTab,
  type InsightsSharedGoalFilters,
  type HeatmapViewMode,
} from "@/features/insights/insights-tab";
import type { GoalDateSort } from "@/lib/goals/list-view";

export function InsightsShell() {
  const { scope, activePartner, viewer, partner } = useDuoSurface("insights");
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [perGoalViewMode, setPerGoalViewMode] = useState<HeatmapViewMode>("month");
  const [goalSearchQuery, setGoalSearchQuery] = useState("");
  const [goalEndMonth, setGoalEndMonth] = useState<string | null>(null);
  const [goalSort, setGoalSort] = useState<GoalDateSort>("earliest_end");
  const [showHistoricalGoals, setShowHistoricalGoals] = useState(false);
  const sharePeriodControls = scope === "both" && Boolean(activePartner);
  const shareGoalFilters = scope === "both" && Boolean(activePartner);

  // Memoized because InsightsTab derives its setMonthCursor callback from this
  // object; a fresh literal each render would churn that callback and every
  // handler depending on it.
  const sharedPeriod = useMemo(
    () =>
      sharePeriodControls
        ? {
            monthCursor,
            onMonthCursorChange: setMonthCursor,
            perGoalViewMode,
            onPerGoalViewModeChange: setPerGoalViewMode,
          }
        : undefined,
    [monthCursor, perGoalViewMode, sharePeriodControls]
  );
  const sharedGoalFilters = useMemo<InsightsSharedGoalFilters | undefined>(
    () =>
      shareGoalFilters
        ? {
            goalSearchQuery,
            setGoalSearchQuery,
            goalEndMonth,
            setGoalEndMonth,
            goalSort,
            setGoalSort,
            showHistoricalGoals,
            setShowHistoricalGoals,
          }
        : undefined,
    [
      goalEndMonth,
      goalSearchQuery,
      goalSort,
      shareGoalFilters,
      showHistoricalGoals,
    ]
  );

  return (
    <div className="space-y-4">
      {sharePeriodControls ? (
        <InsightsPeriodControls
          monthCursor={monthCursor}
          onMonthCursorChange={setMonthCursor}
          perGoalViewMode={perGoalViewMode}
          onPerGoalViewModeChange={setPerGoalViewMode}
        />
      ) : null}
      <DuoLanes
        scope={scope}
        viewer={viewer}
        partner={partner}
        renderLane={(subject) => (
          <InsightsTab
            subjectUserId={subject.userId}
            readOnly={subject.readOnly}
            sharedPeriod={sharedPeriod}
            sharedGoalFilters={sharedGoalFilters}
          />
        )}
      />
    </div>
  );
}
