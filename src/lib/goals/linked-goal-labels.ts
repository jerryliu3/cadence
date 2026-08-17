import { format, isValid, parse } from "date-fns";
import type { Goal } from "@/lib/goals/types";
import { addDaysToDateString } from "@/lib/goals/periods";

export function formatGoalDateLabel(date: string): string {
  const parsedDate = parse(date, "yyyy-MM-dd", new Date());
  if (!isValid(parsedDate)) {
    return date;
  }
  return format(parsedDate, "MMM d, yyyy");
}

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

export function getLinkedTargetSchedulingNotice({
  sourceEndDate,
}: {
  sourceEndDate: string | null;
}) {
  if (!sourceEndDate) {
    return "Linked targets stay hidden while this source goal remains active because it has no end date.";
  }
  return `Linked targets stay hidden through ${formatGoalDateLabel(sourceEndDate)} and can appear from ${formatGoalDateLabel(addDaysToDateString(sourceEndDate, 1))}.`;
}
