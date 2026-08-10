"use client";

import { defaultMilestoneName } from "@/lib/goals/milestones";

interface MilestoneSummaryPillsProps {
  targetCount: number;
  completionDates: string[];
  milestoneNames: string[];
}

export function MilestoneSummaryPills({
  targetCount,
  completionDates,
  milestoneNames,
}: MilestoneSummaryPillsProps) {
  const safeTarget = Math.max(targetCount, 1);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Milestones</p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: safeTarget }).map((_, index) => {
          const completionDate = completionDates[index];
          const complete = Boolean(completionDate);
          const milestoneName = milestoneNames[index] ?? defaultMilestoneName(index);

          return (
            <div
              key={`${index + 1}-shared-milestone`}
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
    </div>
  );
}
