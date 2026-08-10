import type { Goal } from "@/lib/goals/types";

export function getLinkedGoalRecurrenceLabel(
  goal: Pick<Goal, "frequency_type" | "recurrence_interval">
): string {
  if (goal.frequency_type === "fixed_milestones") {
    return "Milestone";
  }

  if (goal.recurrence_interval === "weekly") {
    return "Weekly";
  }

  if (goal.recurrence_interval === "monthly") {
    return "Monthly";
  }

  return "Daily";
}

export function getLinkedGoalDeadlineLabel(goal: Pick<Goal, "end_date">): string {
  return goal.end_date ? `Due ${goal.end_date}` : "No deadline";
}
