"use client";

import { useMemo, useState } from "react";
import { DuoLanes } from "@/features/social/duo/duo-lanes";
import { useDuoSurface } from "@/features/social/duo/use-duo-surface";
import { InsightsPeriodControls } from "@/features/insights/insights-period-controls";
import {
  InsightsTab,
  type HeatmapViewMode,
} from "@/features/insights/insights-tab";

export function InsightsShell() {
  const { scope, activePartner, viewer, partner } = useDuoSurface("insights");
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [perGoalViewMode, setPerGoalViewMode] = useState<HeatmapViewMode>("month");
  const sharePeriodControls = scope === "both" && Boolean(activePartner);

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
          />
        )}
      />
    </div>
  );
}
