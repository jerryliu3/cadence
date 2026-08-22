import { compareDateStrings } from "@/lib/goals/periods";
import { formatGoalDateLabel } from "@/lib/goals/linked-goal-labels";
import { getScopeDateRange } from "@/lib/planner/dates";
import type { PlannerGoalLinkSummary } from "@cadence/shared/planner/context";

export interface PlannerLinkedTargetScopeStatus {
  state: "suppressed" | "visible" | "indefinite";
  resumeDate: string | null;
}

export interface LinkedTargetSuppressionDetail {
  goalId: string;
  goalTitle: string;
  statusCopy: string;
  sourceGoalTitles: string[];
}

interface LinkedTargetEligibilityEntry {
  goalId: string;
  eligible: boolean;
  reason: string;
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
    return "hidden while linked subgoals are still active";
  }
  if (status.state === "suppressed") {
    return status.resumeDate
      ? `hidden this month, returns ${formatGoalDateLabel(status.resumeDate)}`
      : "hidden in this month";
  }
  return "showing this month";
}

export function describeLinkedTargetSuppression({
  eligibility,
  links,
  goalTitles,
  scopeMonth,
}: {
  eligibility: ReadonlyArray<LinkedTargetEligibilityEntry>;
  links: ReadonlyArray<PlannerGoalLinkSummary>;
  goalTitles: Record<string, string>;
  scopeMonth: string;
}): {
  linkedTargetCount: number;
  linkedTargetDetails: LinkedTargetSuppressionDetail[];
} {
  let linkedTargetCount = 0;
  const linkedTargetDetailsByGoalId = new Map<string, LinkedTargetSuppressionDetail>();
  const linkedTargetIndexes = buildPlannerLinkedTargetIndexes(links);

  for (const eligibilityEntry of eligibility) {
    if (eligibilityEntry.eligible || eligibilityEntry.reason !== "linked_target") {
      continue;
    }
    linkedTargetCount += 1;
    if (linkedTargetDetailsByGoalId.has(eligibilityEntry.goalId)) {
      continue;
    }

    const targetLinks =
      linkedTargetIndexes.linksByTargetGoalId.get(eligibilityEntry.goalId) ?? [];
    const representativeLink = targetLinks[0];
    const statusCopy = representativeLink
      ? describeLinkedTargetStatus(
          getLinkedTargetScopeStatus({
            scopeMonth,
            targetSuppressionKind: representativeLink.targetSuppressionKind,
            targetResumesOn: representativeLink.targetResumesOn,
          })
        )
      : "hidden in this month";
    const sourceGoalTitles = Array.from(
      new Set(
        targetLinks.map(
          (targetLink) =>
            goalTitles[targetLink.sourceGoalId] ?? targetLink.sourceGoalId
        )
      )
    ).sort((left, right) => left.localeCompare(right));

    linkedTargetDetailsByGoalId.set(eligibilityEntry.goalId, {
      goalId: eligibilityEntry.goalId,
      goalTitle: goalTitles[eligibilityEntry.goalId] ?? eligibilityEntry.goalId,
      statusCopy,
      sourceGoalTitles,
    });
  }

  return {
    linkedTargetCount,
    linkedTargetDetails: Array.from(linkedTargetDetailsByGoalId.values()).sort(
      (left, right) => left.goalTitle.localeCompare(right.goalTitle)
    ),
  };
}
