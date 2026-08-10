import type { GoalFrequencyType } from "@/lib/goals/types";
import { isOrdinalGoalDefinition } from "@/lib/goals/definition-validation";

export function canShowRecurrenceFields(
  frequencyType: GoalFrequencyType
): boolean {
  return frequencyType === "recurring";
}

export function canShowTargetCount(frequencyType: GoalFrequencyType): boolean {
  return (
    frequencyType === "fixed_milestones" || frequencyType === "recurring"
  );
}

export function deriveDefinitionTargetCount({
  frequencyType,
  targetCountRaw,
  parsedTargetCount,
}: {
  frequencyType: GoalFrequencyType;
  targetCountRaw: string;
  parsedTargetCount: number | null;
}): number | null {
  if (frequencyType === "fixed_milestones") {
    return parsedTargetCount;
  }
  return targetCountRaw.trim().length > 0 ? parsedTargetCount : null;
}

export function getFixedMilestoneCount(
  frequencyType: GoalFrequencyType,
  parsedTargetCount: number | null
): number {
  return frequencyType === "fixed_milestones" ? parsedTargetCount ?? 0 : 0;
}

export function requiresGoalEndDate(
  frequencyType: GoalFrequencyType,
  definitionTargetCount: number | null
): boolean {
  return isOrdinalGoalDefinition({
    frequencyType,
    targetCount: definitionTargetCount,
  });
}
