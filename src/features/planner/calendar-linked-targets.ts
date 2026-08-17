import {
  addDaysToDateString,
  compareDateStrings,
} from "@/lib/goals/periods";
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
    if (!targets.includes(link.targetGoalId)) {
      targets.push(link.targetGoalId);
      targets.sort((left, right) => left.localeCompare(right));
      targetsBySourceGoalId.set(link.sourceGoalId, targets);
    }
    const sources = sourceGoalsByTargetGoalId.get(link.targetGoalId) ?? [];
    if (!sources.includes(link.sourceGoalId)) {
      sources.push(link.sourceGoalId);
      sources.sort((left, right) => left.localeCompare(right));
      sourceGoalsByTargetGoalId.set(link.targetGoalId, sources);
    }
    const sourceLinks = linksBySourceGoalId.get(link.sourceGoalId) ?? [];
    sourceLinks.push(link);
    sourceLinks.sort((left, right) => left.targetGoalId.localeCompare(right.targetGoalId));
    linksBySourceGoalId.set(link.sourceGoalId, sourceLinks);
    const targetLinks = linksByTargetGoalId.get(link.targetGoalId) ?? [];
    targetLinks.push(link);
    targetLinks.sort((left, right) => left.sourceGoalId.localeCompare(right.sourceGoalId));
    linksByTargetGoalId.set(link.targetGoalId, targetLinks);
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
  sourcePlannedEndDate,
}: {
  scopeMonth: string;
  targetSuppressionKind?: PlannerGoalLinkSummary["targetSuppressionKind"];
  targetResumesOn?: string | null;
  sourcePlannedEndDate?: string | null;
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
    const resumeDate =
      targetResumesOn ??
      (sourcePlannedEndDate ? addDaysToDateString(sourcePlannedEndDate, 1) : null);
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
  if (sourcePlannedEndDate === null || sourcePlannedEndDate === undefined) {
    return {
      state: "indefinite",
      resumeDate: null,
    };
  }
  const scopeStart = getScopeDateRange(scopeMonth).start;
  if (compareDateStrings(sourcePlannedEndDate, scopeStart) >= 0) {
    return {
      state: "suppressed",
      resumeDate: addDaysToDateString(sourcePlannedEndDate, 1),
    };
  }
  return {
    state: "visible",
    resumeDate: null,
  };
}
