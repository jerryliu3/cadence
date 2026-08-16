"use client";

import { ChecklistSurface } from "@/features/today/checklist-surface";
import { DuoLanes } from "@/features/social/duo/duo-lanes";
import { useDuoSurface } from "@/features/social/duo/use-duo-surface";

export function ChecklistShell() {
  const { scope, viewer, partner } = useDuoSurface("checklist");

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
          />
        )}
      />
    </div>
  );
}
