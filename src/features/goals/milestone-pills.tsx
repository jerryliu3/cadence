"use client";

import { useState } from "react";
import { defaultMilestoneName } from "@/lib/goals/milestones";

interface MilestonePillsProps {
  targetCount: number;
  completionDates: string[];
  milestoneNames?: string[];
  maxVisible?: number;
  label?: string;
}

export function MilestonePills({
  targetCount,
  completionDates,
  milestoneNames = [],
  maxVisible,
  label = "Milestones",
}: MilestonePillsProps) {
  const safeTarget = Math.max(targetCount, 1);
  const canCollapse = typeof maxVisible === "number" && maxVisible > 0 && safeTarget > maxVisible;
  const [expanded, setExpanded] = useState(false);
  const visibleMilestoneCount =
    canCollapse && !expanded ? Math.min(safeTarget, maxVisible) : safeTarget;
  const hiddenMilestoneCount = safeTarget - visibleMilestoneCount;

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: visibleMilestoneCount }).map((_, index) => {
          const completionDate = completionDates[index];
          const complete = Boolean(completionDate);
          const milestoneName = milestoneNames[index] ?? defaultMilestoneName(index);

          return (
            <div
              key={`${index + 1}-step`}
              className={`min-w-[110px] rounded-full border px-2.5 py-1 text-[11px] leading-tight ${
                complete
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              <p className="truncate font-medium">{milestoneName}</p>
              <p className={complete ? "text-foreground/75" : "text-muted-foreground"}>
                {complete ? completionDate : "Pending"}
              </p>
            </div>
          );
        })}
      </div>
      {canCollapse ? (
        <button
          type="button"
          className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded
            ? "Show fewer milestones"
            : `Show ${hiddenMilestoneCount} more milestone${hiddenMilestoneCount === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </div>
  );
}
