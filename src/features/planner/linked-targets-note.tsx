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
      ? "Linked goals can show this month."
      : hiddenCount === 1
        ? "1 linked goal is hidden this month."
        : `${hiddenCount} linked goals are hidden this month.`;
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-dashed p-2 text-xs">
      <div className="flex min-w-0 items-center gap-1.5 font-medium">
        <Link2 className="size-3.5" />
        <span>Linked goals</span>
      </div>
      <p className="mt-1 break-words text-muted-foreground">{summary}</p>
      <ul className="mt-2 min-w-0 space-y-1 text-muted-foreground">
        {rows.map((row) => (
          <li key={row.targetGoalId} className="break-words">
            {row.title}: {describeLinkedTargetStatus(row.status)}
          </li>
        ))}
      </ul>
    </div>
  );
}
