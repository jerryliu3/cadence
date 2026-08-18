import type { Goal, RecurrenceInterval } from "@/lib/goals/types";
import { canonicalHash } from "@/lib/planner/canonical";
import { REQUIREMENT_SCHEMA_VERSION } from "@/lib/planner/contracts/bounds";

export type GoalRequirement =
  | {
      kind: "milestone_sequence";
      targetCount: number;
      labels: string[];
      maxPerDay: 1;
    }
  | {
      kind: "cadence";
      interval: RecurrenceInterval;
      maxPerDay: 1;
    }
  | {
      kind: "deadline_total";
      targetCount: number;
      maxPerDay: 1;
    };

export interface NormalizedGoalRequirement {
  schemaVersion: typeof REQUIREMENT_SCHEMA_VERSION;
  requirement: GoalRequirement;
  requirementFingerprint: string;
}

export function positiveTarget(goal: Goal) {
  return Math.max(1, goal.target_count ?? 1);
}

export function isTargetedRecurringGoal(goal: Goal) {
  return (
    goal.frequency_type === "recurring" &&
    typeof goal.target_count === "number" &&
    goal.target_count > 0
  );
}

export function getGoalRequirement(goal: Goal): GoalRequirement {
  if (goal.frequency_type === "fixed_milestones") {
    const targetCount = positiveTarget(goal);
    return {
      kind: "milestone_sequence",
      targetCount,
      labels: Array.from({ length: targetCount }, (_, index) => {
        const configured = goal.milestone_names?.[index]?.trim();
        return configured || `Milestone ${index + 1}`;
      }),
      maxPerDay: 1,
    };
  }

  const interval = goal.recurrence_interval ?? "daily";
  if (isTargetedRecurringGoal(goal)) {
    return {
      kind: "deadline_total",
      targetCount: positiveTarget(goal),
      maxPerDay: 1,
    };
  }

  return {
    kind: "cadence",
    interval,
    maxPerDay: 1,
  };
}

export function computeRequirementFingerprint(goal: Goal) {
  const requirement = getGoalRequirement(goal);
  return canonicalHash({
    schemaVersion: REQUIREMENT_SCHEMA_VERSION,
    requirement,
    startDate: goal.start_date,
    endDate: goal.end_date,
  });
}

export function normalizeGoalRequirement(
  goal: Goal
): NormalizedGoalRequirement {
  return {
    schemaVersion: REQUIREMENT_SCHEMA_VERSION,
    requirement: getGoalRequirement(goal),
    requirementFingerprint: computeRequirementFingerprint(goal),
  };
}
