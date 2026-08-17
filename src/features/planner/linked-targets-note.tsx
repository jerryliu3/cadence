"use client";

import { Link2 } from "lucide-react";
import { getLinkedTargetScopeStatus } from "@/features/planner/calendar-linked-targets";

export function LinkedTargetsNote({
  sourceGoalId,
  sourceEndDate,
  linkedTargetIds,
  goalTitles,
  scopeMonth,
}: {
  sourceGoalId: string;
  sourceEndDate: string | null;
  linkedTargetIds: string[];
  goalTitles: Record<string, string>;
  scopeMonth: string;
}) {
  if (linkedTargetIds.length === 0) {
    return null;
  }
  const status = getLinkedTargetScopeStatus({
    scopeMonth,
    sourceEndDate,
  });
  const message =
    status.state === "indefinite"
      ? "Linked targets stay hidden while this source remains active."
      : status.state === "suppressed"
        ? `Linked targets are hidden in this scope and resume on ${status.resumeDate}.`
        : "Linked targets can appear in this scope.";
  return (
    <div className="rounded-md border border-dashed p-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium">
        <Link2 className="size-3.5" />
        <span>Linked targets</span>
      </div>
      <p className="mt-1 text-muted-foreground">{message}</p>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {linkedTargetIds.map((targetGoalId) => (
          <li key={`${sourceGoalId}:${targetGoalId}`} className="truncate">
            {goalTitles[targetGoalId] ?? targetGoalId}
          </li>
        ))}
      </ul>
    </div>
  );
}
