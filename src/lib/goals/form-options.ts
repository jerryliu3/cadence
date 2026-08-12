import type { GoalFrequencyType, RecurrenceInterval } from "@/lib/goals/types";

export const GOAL_TYPE_OPTIONS: Array<{ value: GoalFrequencyType; label: string }> = [
  { value: "recurring", label: "Repeated" },
  { value: "fixed_milestones", label: "Milestones" },
];

export const RECURRENCE_INTERVAL_OPTIONS: Array<{
  value: RecurrenceInterval;
  label: string;
}> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];
