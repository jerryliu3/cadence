import { compareDateStrings } from "@/lib/goals/periods";
import { getScopeDateRange } from "@/lib/planner/dates";
import type { PlannerGoalLinkSummary } from "@cadence/shared/planner/context";

export interface PlannerLinkedTargetScopeStatus {
  state: "suppressed" | "visible" | "indefinite";
  resumeDate: string | null;
}

export function buildPlannerLinkedTargetIndexes(
  links: ReadonlyArray<PlannerGoalLinkSummary>
) {
  const targetsBySourceGoalId = new Map<string, string[]>();
  const sourceGoalsByTargetGoalId = new Map<string, string[]>();
  const linksBySourceGoalId = new Map<string, PlannerGoalLinkSummary[]>();
  const linksByTargetGoalId = new Map<string, PlannerGoalLinkSummary[]>();
  const seenLinkKeys = new Set<string>();
  for (const link of links) {
    const linkKey = `${link.sourceGoalId}\u0000${link.targetGoalId}`;
    if (seenLinkKeys.has(linkKey)) {
      continue;
    }
    seenLinkKeys.add(linkKey);
    const targets = targetsBySourceGoalId.get(link.sourceGoalId) ?? [];
    targets.push(link.targetGoalId);
    targetsBySourceGoalId.set(link.sourceGoalId, targets);
    const sources = sourceGoalsByTargetGoalId.get(link.targetGoalId) ?? [];
    sources.push(link.sourceGoalId);
    sourceGoalsByTargetGoalId.set(link.targetGoalId, sources);
    const sourceLinks = linksBySourceGoalId.get(link.sourceGoalId) ?? [];
    sourceLinks.push(link);
    linksBySourceGoalId.set(link.sourceGoalId, sourceLinks);
    const targetLinks = linksByTargetGoalId.get(link.targetGoalId) ?? [];
    targetLinks.push(link);
    linksByTargetGoalId.set(link.targetGoalId, targetLinks);
  }
  for (const targetIds of targetsBySourceGoalId.values()) {
    targetIds.sort((left, right) => left.localeCompare(right));
  }
  for (const sourceIds of sourceGoalsByTargetGoalId.values()) {
    sourceIds.sort((left, right) => left.localeCompare(right));
  }
  for (const sourceLinks of linksBySourceGoalId.values()) {
    sourceLinks.sort((left, right) => left.targetGoalId.localeCompare(right.targetGoalId));
  }
  for (const targetLinks of linksByTargetGoalId.values()) {
    targetLinks.sort((left, right) => left.sourceGoalId.localeCompare(right.sourceGoalId));
  }
  return {
    targetsBySourceGoalId,
    sourceGoalsByTargetGoalId,
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
  if (targetSuppressionKind === "until") {
    const resumeDate = targetResumesOn;
    const scopeStart = getScopeDateRange(scopeMonth).start;
    if (resumeDate && compareDateStrings(resumeDate, scopeStart) <= 0) {
      return {
        state: "visible",
        resumeDate: null,
      };
    }
    return {
      state: "suppressed",
      resumeDate,
    };
  }
  return {
    state: "visible",
    resumeDate: null,
  };
}
