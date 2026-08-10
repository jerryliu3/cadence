import {
  getLinkedGoalDeadlineLabel,
  getLinkedGoalRecurrenceLabel,
} from "@/lib/goals/linked-goal-labels";
import type { Goal } from "@/lib/goals/types";

interface LinkableGoalOptions {
  excludeGoalId?: string;
}

export function filterLinkableGoals(
  goals: Goal[],
  progressByGoal: Map<string, { lifecycle?: string }>,
  options: LinkableGoalOptions = {}
): Goal[] {
  const { excludeGoalId } = options;
  return goals.filter((goal) => {
    if (excludeGoalId && goal.id === excludeGoalId) {
      return false;
    }
    if (goal.is_group) {
      return false;
    }
    return progressByGoal.get(goal.id)?.lifecycle === "active";
  });
}

export function filterGoalsByLinkSearch(goals: Goal[], query: string): Goal[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return goals;
  }

  return goals.filter((goal) => {
    const recurrenceLabel = getLinkedGoalRecurrenceLabel(goal).toLowerCase();
    const deadlineLabel = getLinkedGoalDeadlineLabel(goal).toLowerCase();
    return (
      goal.title.toLowerCase().includes(normalized) ||
      recurrenceLabel.includes(normalized) ||
      deadlineLabel.includes(normalized)
    );
  });
}
