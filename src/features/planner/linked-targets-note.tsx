"use client";

import { Link2 } from "lucide-react";
import {
  describeLinkedTargetStatus,
  getLinkedTargetScopeStatus,
} from "@/features/planner/calendar-linked-targets";
import type { PlannerGoalLinkSummary } from "@cadence/shared/planner/context";

export function LinkedTargetsNote({
  linkedTargets,
  goalTitles,
  scopeMonth,
}: {
  linkedTargets: PlannerGoalLinkSummary[];
  goalTitles: Record<string, string>;
  scopeMonth: string;
}) {
  if (linkedTargets.length === 0) {
    return null;
  }
  const rows = linkedTargets
    .map((link) => ({
      targetGoalId: link.targetGoalId,
      title: goalTitles[link.targetGoalId] ?? link.targetGoalId,
      status: getLinkedTargetScopeStatus({
        scopeMonth,
        targetSuppressionKind: link.targetSuppressionKind,
        targetResumesOn: link.targetResumesOn,
      }),
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
  const hiddenCount = rows.filter((row) => row.status.state !== "visible").length;
  const summary =
    hiddenCount === 0
      ? "Linked targets can appear in this month."
      : hiddenCount === 1
        ? "1 linked target is hidden in this month."
        : `${hiddenCount} linked targets are hidden in this month.`;
  return (
    <div className="rounded-md border border-dashed p-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium">
        <Link2 className="size-3.5" />
        <span>Linked targets</span>
      </div>
      <p className="mt-1 text-muted-foreground">{summary}</p>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {rows.map((row) => (
          <li key={row.targetGoalId} className="truncate">
            {row.title}: {describeLinkedTargetStatus(row.status)}
          </li>
        ))}
      </ul>
    </div>
  );
}
