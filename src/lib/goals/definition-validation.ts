import type { GoalFrequencyType } from "@/lib/goals/types";
import { compareDateStrings } from "@/lib/goals/periods";
import { MAX_HORIZON_MONTHS } from "@/lib/planner/contracts/bounds";
import { enumerateMonthsInWindow } from "@/lib/planner/dates";

export interface GoalDefinitionValidationInput {
  frequencyType: GoalFrequencyType;
  targetCount: number | null;
  startDate: string;
  endDate: string | null;
}

export type GoalDefinitionValidationCode =
  | "missing_end_date"
  | "invalid_date_range"
  | "horizon_too_long";

export interface GoalDefinitionValidationIssue {
  code: GoalDefinitionValidationCode;
  message: string;
}

function isIsoDate(value: string | null): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    compareDateStrings(value, value);
    return true;
  } catch {
    return false;
  }
}

export function isOrdinalGoalDefinition({
  frequencyType,
  targetCount,
}: Pick<GoalDefinitionValidationInput, "frequencyType" | "targetCount">) {
  return (
    frequencyType === "fixed_milestones" ||
    (frequencyType === "recurring" &&
      typeof targetCount === "number" &&
      targetCount > 0)
  );
}

export function getGoalDeadlineMonthSpan({
  startDate,
  endDate,
}: Pick<GoalDefinitionValidationInput, "startDate" | "endDate">) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return null;
  }
  if (compareDateStrings(startDate, endDate) > 0) {
    return null;
  }
  return enumerateMonthsInWindow({ start: startDate, end: endDate }).length;
}

export function validateGoalDefinition(
  input: GoalDefinitionValidationInput
): GoalDefinitionValidationIssue[] {
  const issues: GoalDefinitionValidationIssue[] = [];
  const normalizedEndDate =
    input.endDate && input.endDate.length > 0
      ? input.endDate
      : null;
  if (isOrdinalGoalDefinition(input) && normalizedEndDate === null) {
    issues.push({
      code: "missing_end_date",
      message:
        input.frequencyType === "fixed_milestones"
          ? "Milestone goals require an end date."
          : "Recurring goals with a target count require an end date.",
    });
  }
  if (!isIsoDate(input.startDate) || !isIsoDate(normalizedEndDate)) {
    return issues;
  }
  if (compareDateStrings(input.startDate, normalizedEndDate) > 0) {
    issues.push({
      code: "invalid_date_range",
      message: "End date cannot be before start date.",
    });
    return issues;
  }
  const monthSpan = enumerateMonthsInWindow({
    start: input.startDate,
    end: normalizedEndDate,
  }).length;
  if (monthSpan > MAX_HORIZON_MONTHS) {
    issues.push({
      code: "horizon_too_long",
      message: `Goal deadlines cannot span more than ${MAX_HORIZON_MONTHS} calendar months.`,
    });
  }
  return issues;
}
