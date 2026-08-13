"use client";

import { useEffect, useState } from "react";
import { DuoLanes, type DuoLaneSubject } from "@/features/social/duo/duo-lanes";
import { useDuoScope } from "@/features/social/duo/duo-context";
import { InsightsPeriodControls } from "@/features/insights/insights-period-controls";
import {
  InsightsTab,
  type HeatmapViewMode,
} from "@/features/insights/insights-tab";
import { reportDuoTelemetry } from "@/lib/social/duo/telemetry";

export function InsightsShell() {
  const { scope, activePartner } = useDuoScope("both");
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [perGoalViewMode, setPerGoalViewMode] = useState<HeatmapViewMode>("month");
  const sharePeriodControls = scope === "both" && Boolean(activePartner);

  useEffect(() => {
    reportDuoTelemetry("scope_viewed", {
      surface: "insights",
      scope,
      hasPartner: Boolean(activePartner),
    });
  }, [activePartner, scope]);

  const viewerLane: DuoLaneSubject = {
    id: "viewer",
    label: "Mine",
    readOnly: false,
  };
  const partnerLane: DuoLaneSubject | null = activePartner
    ? {
        id: "partner",
        label:
          activePartner.partnerDisplayName ??
          activePartner.partnerUsername ??
          "Partner",
        userId: activePartner.partnerId,
        readOnly: true,
        avatarUrl: activePartner.partnerAvatarUrl,
      }
    : null;

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
        viewer={viewerLane}
        partner={partnerLane}
        renderLane={(subject) => (
          <InsightsTab
            laneLabel={subject.label}
            subjectUserId={subject.userId}
            readOnly={subject.readOnly}
            monthCursor={sharePeriodControls ? monthCursor : undefined}
            onMonthCursorChange={sharePeriodControls ? setMonthCursor : undefined}
            perGoalViewMode={sharePeriodControls ? perGoalViewMode : undefined}
            onPerGoalViewModeChange={
              sharePeriodControls ? setPerGoalViewMode : undefined
            }
            hidePeriodControls={sharePeriodControls}
          />
        )}
      />
    </div>
  );
}
