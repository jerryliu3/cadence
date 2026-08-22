"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { TabOnboardingOverlay } from "@/features/onboarding/tab-onboarding-overlay";
import { DuoLanes } from "@/features/social/duo/duo-lanes";
import { useDuoSurface } from "@/features/social/duo/use-duo-surface";
import {
  InsightsTab,
  type InsightsSharedGoalFilters,
  type HeatmapViewMode,
} from "@/features/insights/insights-tab";
import type { GoalDateSort } from "@/lib/goals/list-view";

export function InsightsShell() {
  const searchParams = useSearchParams();
  const { scope, activePartner, viewer, partner } = useDuoSurface("insights");
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [perGoalViewMode, setPerGoalViewMode] = useState<HeatmapViewMode>("month");
  const [goalSearchQuery, setGoalSearchQuery] = useState("");
  const [goalEndMonths, setGoalEndMonths] = useState<string[]>([]);
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
            goalEndMonths,
            setGoalEndMonths,
            goalSort,
            setGoalSort,
            showHistoricalGoals,
            setShowHistoricalGoals,
          }
        : undefined,
    [
      goalEndMonths,
      goalSearchQuery,
      goalSort,
      shareGoalFilters,
      showHistoricalGoals,
    ]
  );

  return (
    <div className="space-y-4">
      <TabOnboardingOverlay
        onboardingKey="insights.main"
        title="Insights guide"
        description="Use Insights to review streaks, consistency, and where your effort is compounding over time."
        forceOpen={searchParams.get("onboarding") === "insights.main"}
      />
      {sharePeriodControls ? (
        <>
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
                contentMode="overall-only"
              />
            )}
          />
          <div className="mx-auto w-full md:max-w-3xl">
            <InsightsTab
              sharedPeriod={sharedPeriod}
              sharedGoalFilters={sharedGoalFilters}
              contentMode="goal-stats-only"
            />
          </div>
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
            <InsightsTab
              subjectUserId={subject.userId}
              readOnly={subject.readOnly}
              sharedPeriod={sharedPeriod}
              sharedGoalFilters={sharedGoalFilters}
            />
          )}
        />
      )}
    </div>
  );
}
