import type { Goal } from "@/lib/goals/types";
import { resolveGoalPlanningEndDate } from "@/lib/goals/definition-validation";
import type { DateWindow } from "@/lib/planner/dates";
import { compareDateStrings } from "@/lib/goals/periods";
import { addDaysToDateString } from "@/lib/goals/periods";

export interface LinkSuppressionSource {
  id: string;
  ownerId: string;
  isDeleted: boolean;
  archivedAt: string | null;
  startDate: string;
  endDate: string | null;
  frequencyType: Goal["frequency_type"];
  targetCount: number | null;
}

export type LinkSuppression =
  | { kind: "none" }
  | { kind: "until"; through: string }
  | { kind: "indefinite" };

interface LinkEdge {
  sourceGoalId: string;
  targetGoalId: string;
}

export function toLinkSuppressionSource(goal: Goal): LinkSuppressionSource {
  return {
    id: goal.id,
    ownerId: goal.owner_id,
    isDeleted: goal.is_deleted,
    archivedAt: goal.archived_at,
    startDate: goal.start_date,
    endDate: goal.end_date,
    frequencyType: goal.frequency_type,
    targetCount: goal.target_count,
  };
}

export function resolveLinkSuppression({
  goalId,
  links,
  sourcesById,
  ownerId,
  asOfDate,
}: {
  goalId: string;
  links: ReadonlyArray<LinkEdge>;
  sourcesById: ReadonlyMap<string, LinkSuppressionSource>;
  ownerId: string;
  asOfDate: string;
}): LinkSuppression {
  let latestSuppressionEnd: string | null = null;
  for (const link of links) {
    if (link.targetGoalId !== goalId) {
      continue;
    }
    const source = sourcesById.get(link.sourceGoalId);
    if (!source) {
      continue;
    }
    if (
      source.ownerId !== ownerId ||
      source.isDeleted ||
      source.archivedAt !== null
    ) {
      continue;
    }
    const effectiveEnd = resolveGoalPlanningEndDate({
      frequencyType: source.frequencyType,
      targetCount: source.targetCount,
      startDate: source.startDate,
      endDate: source.endDate,
      asOfDate,
    });
    if (effectiveEnd !== null && compareDateStrings(effectiveEnd, source.startDate) < 0) {
      continue;
    }
    if (effectiveEnd === null) {
      return { kind: "indefinite" };
    }
    if (
      latestSuppressionEnd === null ||
      compareDateStrings(effectiveEnd, latestSuppressionEnd) > 0
    ) {
      latestSuppressionEnd = effectiveEnd;
    }
  }
  if (latestSuppressionEnd === null) {
    return { kind: "none" };
  }
  return { kind: "until", through: latestSuppressionEnd };
}

export function isSuppressedInWindow(
  suppression: LinkSuppression,
  window: DateWindow
) {
  // Visible scope is the planner kernel DateWindow, not mounted calendar cells.
  return (
    suppression.kind === "indefinite" ||
    (suppression.kind === "until" &&
      compareDateStrings(suppression.through, window.start) >= 0)
  );
}

export function isSuppressedOnDate(suppression: LinkSuppression, date: string) {
  return (
    suppression.kind === "indefinite" ||
    (suppression.kind === "until" &&
      compareDateStrings(suppression.through, date) >= 0)
  );
}

export function getLinkResumeDate(suppression: LinkSuppression): string | null {
  if (suppression.kind !== "until") {
    return null;
  }
  return addDaysToDateString(suppression.through, 1);
}
