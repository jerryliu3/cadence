"use client";

import { DuoLanes, type DuoLaneSubject } from "@/features/social/duo/duo-lanes";
import { useDuoScope } from "@/features/social/duo/duo-context";
import { InsightsTab } from "@/features/insights/insights-tab";

export function InsightsShell() {
  const { scope, activePartner } = useDuoScope("both");
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
    <DuoLanes
      scope={scope}
      viewer={viewerLane}
      partner={partnerLane}
      renderLane={(subject) => (
        <InsightsTab
          laneLabel={subject.label}
          subjectUserId={subject.userId}
          readOnly={subject.readOnly}
        />
      )}
    />
  );
}
