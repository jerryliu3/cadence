import { compareDateStrings } from "@/lib/goals/periods";
import { formatGoalDateLabel } from "@/lib/goals/linked-goal-labels";
import { getScopeDateRange } from "@/lib/planner/dates";
import type { PlannerGoalLinkSummary } from "@cadence/shared/planner/context";

export interface PlannerLinkedTargetScopeStatus {
  state: "suppressed" | "visible" | "indefinite";
  resumeDate: string | null;
}

export function buildPlannerLinkedTargetIndexes(
  links: ReadonlyArray<PlannerGoalLinkSummary>
) {
  const linksBySourceGoalId = new Map<string, PlannerGoalLinkSummary[]>();
  const linksByTargetGoalId = new Map<string, PlannerGoalLinkSummary[]>();
  for (const link of links) {
    const sourceLinks = linksBySourceGoalId.get(link.sourceGoalId) ?? [];
    sourceLinks.push(link);
    linksBySourceGoalId.set(link.sourceGoalId, sourceLinks);
    const targetLinks = linksByTargetGoalId.get(link.targetGoalId) ?? [];
    targetLinks.push(link);
    linksByTargetGoalId.set(link.targetGoalId, targetLinks);
  }
  for (const sourceLinks of linksBySourceGoalId.values()) {
    sourceLinks.sort((left, right) => left.targetGoalId.localeCompare(right.targetGoalId));
  }
  for (const targetLinks of linksByTargetGoalId.values()) {
    targetLinks.sort((left, right) => left.sourceGoalId.localeCompare(right.sourceGoalId));
  }
  return {
    linksBySourceGoalId,
    linksByTargetGoalId,
  };
}

export function getLinkedTargetScopeStatus({
  scopeMonth,
  targetSuppressionKind,
  targetResumesOn,
}: {
  scopeMonth: string;
  targetSuppressionKind: PlannerGoalLinkSummary["targetSuppressionKind"];
  targetResumesOn: string | null;
}): PlannerLinkedTargetScopeStatus {
  if (targetSuppressionKind === "indefinite") {
    return {
      state: "indefinite",
      resumeDate: null,
    };
  }
  if (targetSuppressionKind === "none") {
    return {
      state: "visible",
      resumeDate: null,
    };
  }
  const scopeStart = getScopeDateRange(scopeMonth).start;
  if (targetResumesOn && compareDateStrings(targetResumesOn, scopeStart) <= 0) {
    return {
      state: "visible",
      resumeDate: null,
    };
  }
  return {
    state: "suppressed",
    resumeDate: targetResumesOn,
  };
}

export function describeLinkedTargetStatus(
  status: PlannerLinkedTargetScopeStatus
): string {
  if (status.state === "indefinite") {
    return "hidden while linked source goals remain active";
  }
  if (status.state === "suppressed") {
    return status.resumeDate
      ? `hidden in this month and resumes on ${formatGoalDateLabel(status.resumeDate)}`
      : "hidden in this month";
  }
  return "visible in this month";
}
