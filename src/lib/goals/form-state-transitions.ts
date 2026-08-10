import type { GoalFrequencyType } from "@/lib/goals/types";
import { buildMilestoneNameDrafts } from "@/lib/goals/milestones";
import { parseGoalTargetCount } from "@/lib/goals/form-parsing";

export interface GoalMilestoneEditableState {
  frequency_type: GoalFrequencyType;
  target_count: string;
  milestone_names: string[];
}

export function applyFrequencyTypeChange<TState extends GoalMilestoneEditableState>(
  previous: TState,
  nextFrequency: GoalFrequencyType
): TState {
  const nextTargetCount =
    nextFrequency === "fixed_milestones" &&
    previous.target_count.trim().length === 0
      ? "3"
      : previous.target_count;

  return {
    ...previous,
    frequency_type: nextFrequency,
    target_count: nextTargetCount,
    milestone_names:
      nextFrequency === "fixed_milestones"
        ? buildMilestoneNameDrafts(
            parseGoalTargetCount(nextTargetCount, { requirePositive: true }) ?? 0,
            previous.milestone_names
          )
        : previous.milestone_names,
  };
}

export function applyTargetCountChange<TState extends GoalMilestoneEditableState>(
  previous: TState,
  nextTargetCount: string
): TState {
  return {
    ...previous,
    target_count: nextTargetCount,
    milestone_names:
      previous.frequency_type === "fixed_milestones"
        ? buildMilestoneNameDrafts(
            parseGoalTargetCount(nextTargetCount, { requirePositive: true }) ?? 0,
            previous.milestone_names
          )
        : previous.milestone_names,
  };
}

export function applyMilestoneNameChange<TState extends GoalMilestoneEditableState>(
  previous: TState,
  index: number,
  value: string
): TState {
  const milestoneNames = [...previous.milestone_names];
  milestoneNames[index] = value;
  return {
    ...previous,
    milestone_names: milestoneNames,
  };
}
