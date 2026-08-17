"use client";

import { Link2 } from "lucide-react";
import { getLinkedTargetScopeStatus } from "@/features/planner/calendar-linked-targets";
import { formatGoalDateLabel } from "@/lib/goals/linked-goal-labels";
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
  const statusByTargetGoalId = new Map<
    string,
    ReturnType<typeof getLinkedTargetScopeStatus>
  >();
  for (const link of linkedTargets) {
    const nextStatus = getLinkedTargetScopeStatus({
      scopeMonth,
      targetSuppressionKind: link.targetSuppressionKind,
      targetResumesOn: link.targetResumesOn,
      sourcePlannedEndDate: link.sourcePlannedEndDate,
    });
    const existingStatus = statusByTargetGoalId.get(link.targetGoalId);
    if (!existingStatus) {
      statusByTargetGoalId.set(link.targetGoalId, nextStatus);
      continue;
    }
    if (existingStatus.state === "indefinite") {
      continue;
    }
    if (nextStatus.state === "indefinite") {
      statusByTargetGoalId.set(link.targetGoalId, nextStatus);
      continue;
    }
    if (
      existingStatus.state === "suppressed" &&
      nextStatus.state === "suppressed" &&
      existingStatus.resumeDate &&
      nextStatus.resumeDate &&
      existingStatus.resumeDate < nextStatus.resumeDate
    ) {
      statusByTargetGoalId.set(link.targetGoalId, nextStatus);
      continue;
    }
    if (existingStatus.state === "visible" && nextStatus.state === "suppressed") {
      statusByTargetGoalId.set(link.targetGoalId, nextStatus);
    }
  }
  const rows = Array.from(statusByTargetGoalId.entries())
    .map(([targetGoalId, status]) => ({
      targetGoalId,
      title: goalTitles[targetGoalId] ?? targetGoalId,
      status,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
  const hiddenCount = rows.filter((row) => row.status.state !== "visible").length;
  const summary =
    hiddenCount === 0
      ? "Linked targets can appear in this scope."
      : hiddenCount === 1
        ? "1 linked target is hidden in this scope."
        : `${hiddenCount} linked targets are hidden in this scope.`;
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
            {row.title}:{" "}
            {row.status.state === "indefinite"
              ? "hidden while linked source goals remain active"
              : row.status.state === "suppressed"
                ? row.status.resumeDate
                  ? `hidden in this scope and resumes on ${formatGoalDateLabel(row.status.resumeDate)}`
                  : "hidden in this scope"
                : "visible in this scope"}
          </li>
        ))}
      </ul>
    </div>
  );
}
