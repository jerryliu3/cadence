import type { Completion, Goal } from "@/lib/goals/types";
import {
  buildLinkSuppressionInboundIndex,
  getLinkResumeDate,
  resolveLinkSuppression,
  toLinkSuppressionSource,
} from "@/lib/planner/link-suppression";
import { buildGoalPreparationWindows } from "@/lib/planner/preparation-windows";
import { normalizeGoalRequirement } from "@/lib/planner/requirements";

export function buildPlannedDatesByGoalIdFromPlannerItems(
  items: Array<{ goal_id: string; scheduled_date: string }>
) {
  const plannedDatesByGoalId = new Map<string, string[]>();
  for (const item of items) {
    const entries = plannedDatesByGoalId.get(item.goal_id) ?? [];
    entries.push(item.scheduled_date);
    plannedDatesByGoalId.set(item.goal_id, entries);
  }
  return plannedDatesByGoalId;
}

export function buildPlannedDatesByGoalIdFromAssignments(
  assignments: Array<{ goalId: string; scheduledDate: string | null }>
) {
  const plannedDatesByGoalId = new Map<string, string[]>();
  for (const assignment of assignments) {
    if (!assignment.scheduledDate) continue;
    const entries = plannedDatesByGoalId.get(assignment.goalId) ?? [];
    entries.push(assignment.scheduledDate);
    plannedDatesByGoalId.set(assignment.goalId, entries);
  }
  return plannedDatesByGoalId;
}

export function indexCompletionsByGoalId(completions: Completion[]) {
  const completionsByGoalId = new Map<string, Completion[]>();
  for (const completion of completions) {
    const entries = completionsByGoalId.get(completion.goal_id) ?? [];
    entries.push(completion);
    completionsByGoalId.set(completion.goal_id, entries);
  }
  return completionsByGoalId;
}

export function collectProjectedLinkedSourceCoverageDates({
  goal,
  effectiveEnd,
  asOfDate,
  linkSourceGoals,
  completionsByGoalId,
  plannedDatesByGoalId,
}: {
  goal: Goal;
  effectiveEnd: string;
  asOfDate: string;
  linkSourceGoals: Goal[];
  completionsByGoalId: Map<string, Completion[]>;
  plannedDatesByGoalId: Map<string, string[]>;
}) {
  const requirement = normalizeGoalRequirement(goal).requirement;
  if (requirement.kind === "cadence" || linkSourceGoals.length === 0) {
    return new Set<string>();
  }
  const projectedCoverageDates = new Set<string>();
  for (const sourceGoal of linkSourceGoals) {
    if (sourceGoal.is_deleted || sourceGoal.archived_at !== null) {
      continue;
    }
    for (const completion of completionsByGoalId.get(sourceGoal.id) ?? []) {
      if (
        completion.completed_on < sourceGoal.start_date ||
        completion.completed_on > asOfDate ||
        (sourceGoal.end_date !== null && completion.completed_on > sourceGoal.end_date) ||
        completion.completed_on < goal.start_date ||
        completion.completed_on > effectiveEnd
      ) {
        continue;
      }
      projectedCoverageDates.add(completion.completed_on);
    }
    for (const scheduledDate of plannedDatesByGoalId.get(sourceGoal.id) ?? []) {
      if (
        scheduledDate < asOfDate ||
        scheduledDate < sourceGoal.start_date ||
        (sourceGoal.end_date !== null && scheduledDate > sourceGoal.end_date) ||
        scheduledDate < goal.start_date ||
        scheduledDate > effectiveEnd
      ) {
        continue;
      }
      projectedCoverageDates.add(scheduledDate);
    }
  }
  return projectedCoverageDates;
}

export function computeProjectedLinkedSourceCoverageCount({
  goal,
  projectedCoverageDates,
}: {
  goal: Goal;
  projectedCoverageDates: Set<string>;
}) {
  const requirement = normalizeGoalRequirement(goal).requirement;
  if (requirement.kind === "cadence") {
    return 0;
  }
  return Math.min(projectedCoverageDates.size, requirement.targetCount);
}

export function computeLinkedSourceCoverageByGoalId({
  goals,
  links,
  ownerId,
  asOfDate,
  preparationStart,
  preparationEnd,
  completionsByGoalId,
  plannedDatesByGoalId,
}: {
  goals: Goal[];
  links: Array<{ sourceGoalId: string; targetGoalId: string }>;
  ownerId: string;
  asOfDate: string;
  preparationStart: string;
  preparationEnd: string;
  completionsByGoalId: Map<string, Completion[]>;
  plannedDatesByGoalId: Map<string, string[]>;
}) {
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const suppressionInboundIndex = buildLinkSuppressionInboundIndex(links);
  const suppressionSourcesById = new Map(
    goals.map((goal) => [goal.id, toLinkSuppressionSource(goal)])
  );
  const projectedCoverageCountByGoalId = new Map<string, number>();
  for (const goal of goals) {
    const suppression = resolveLinkSuppression({
      goalId: goal.id,
      inboundSourceIdsByTargetId: suppressionInboundIndex,
      sourcesById: suppressionSourcesById,
      ownerId,
      asOfDate,
    });
    const resumeDate = getLinkResumeDate(suppression);
    const goalPreparationStart =
      resumeDate && resumeDate > preparationStart ? resumeDate : preparationStart;
    const goalWindowsState = buildGoalPreparationWindows({
      goal,
      asOfDate,
      preparationStart: goalPreparationStart,
      preparationEnd,
    });
    const linkSourceGoals = Array.from(
      new Map(
        links
          .filter((link) => link.targetGoalId === goal.id)
          .map((link) => [link.sourceGoalId, goalById.get(link.sourceGoalId)])
      ).values()
    ).filter((linkSourceGoal): linkSourceGoal is Goal => Boolean(linkSourceGoal));
    const projectedCoverageDates = collectProjectedLinkedSourceCoverageDates({
      goal,
      effectiveEnd: goalWindowsState.effectiveEnd,
      asOfDate,
      linkSourceGoals,
      completionsByGoalId,
      plannedDatesByGoalId,
    });
    projectedCoverageCountByGoalId.set(
      goal.id,
      computeProjectedLinkedSourceCoverageCount({
        goal,
        projectedCoverageDates,
      })
    );
  }
  return { projectedCoverageCountByGoalId };
}

function parseOrdinalFromUnitKey(unitKey: string) {
  const [, ordinalRaw] = unitKey.split(":");
  const ordinal = Number(ordinalRaw ?? 0);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

export function mapProjectedCoverageToUnitKeys({
  requiredUnitKeys,
  completionCreditedUnitKeys,
  projectedCoverageCount,
}: {
  requiredUnitKeys: Set<string>;
  completionCreditedUnitKeys: Set<string>;
  projectedCoverageCount: number;
}) {
  if (projectedCoverageCount <= 0) {
    return new Set<string>();
  }
  const unresolvedRequiredUnitKeys = Array.from(requiredUnitKeys)
    .filter((unitKey) => !completionCreditedUnitKeys.has(unitKey))
    .sort((left, right) => {
      const leftOrdinal = parseOrdinalFromUnitKey(left) ?? 0;
      const rightOrdinal = parseOrdinalFromUnitKey(right) ?? 0;
      return leftOrdinal - rightOrdinal;
    });
  return new Set(unresolvedRequiredUnitKeys.slice(0, projectedCoverageCount));
}

export function mapProjectedCoverageOrdinals({
  targetCount,
  completionCreditedOrdinals,
  projectedCoverageCount,
}: {
  targetCount: number;
  completionCreditedOrdinals: Set<number>;
  projectedCoverageCount: number;
}) {
  if (projectedCoverageCount <= 0 || targetCount <= 0) {
    return new Set<number>();
  }
  const unresolvedOrdinals = Array.from({ length: targetCount }, (_, index) => index + 1)
    .filter((ordinal) => !completionCreditedOrdinals.has(ordinal));
  return new Set(unresolvedOrdinals.slice(0, projectedCoverageCount));
}

export function extractOrdinalsFromUnitKeys(unitKeys: Set<string>) {
  return new Set(
    Array.from(unitKeys)
      .map((unitKey) => parseOrdinalFromUnitKey(unitKey))
      .filter((ordinal): ordinal is number => ordinal !== null)
  );
}
