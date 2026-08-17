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
  for (const link of links) {
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
  }
  return {
    targetsBySourceGoalId,
    sourceGoalsByTargetGoalId,
  };
}

export function getLinkedTargetScopeStatus({
  scopeMonth,
  sourceEndDate,
}: {
  scopeMonth: string;
  sourceEndDate: string | null;
}): PlannerLinkedTargetScopeStatus {
  if (sourceEndDate === null) {
    return {
      state: "indefinite",
      resumeDate: null,
    };
  }
  const scopeStart = getScopeDateRange(scopeMonth).start;
  if (compareDateStrings(sourceEndDate, scopeStart) >= 0) {
    return {
      state: "suppressed",
      resumeDate: addDaysToDateString(sourceEndDate, 1),
    };
  }
  return {
    state: "visible",
    resumeDate: null,
  };
}
