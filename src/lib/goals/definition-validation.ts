import type { GoalFrequencyType } from "@/lib/goals/types";
import { compareDateStrings } from "@/lib/goals/periods";
import {
  MAX_GOAL_TARGET_COUNT,
  MAX_HORIZON_MONTHS,
} from "@/lib/planner/contracts/bounds";
import { enumerateDates, enumerateMonthsInWindow, getUtcWeekday } from "@/lib/planner/dates";

export { MAX_GOAL_TARGET_COUNT } from "@/lib/planner/contracts/bounds";

export interface GoalDefinitionValidationInput {
  frequencyType: GoalFrequencyType;
  targetCount: number | null;
  startDate: string;
  endDate: string | null;
  asOfDate?: string;
  capacity?: GoalCapacityInput;
}

export interface GoalCapacityInput {
  restWeekdays: number[];
  blackoutRanges: Array<{ start: string; end: string }>;
}

export type GoalDefinitionValidationCode =
  | "invalid_date_range"
  | "horizon_too_long"
  | "target_exceeds_limit"
  | "target_exceeds_capacity";

export interface GoalDefinitionValidationIssue {
  code: GoalDefinitionValidationCode;
  message: string;
}

export function countAvailableDays(
  { start, end }: { start: string; end: string },
  capacity: GoalCapacityInput
) {
  if (compareDateStrings(start, end) > 0) {
    return 0;
  }
  const restWeekdays = new Set(capacity.restWeekdays);
  let available = 0;
  for (const date of enumerateDates({ start, end })) {
    if (restWeekdays.has(getUtcWeekday(date))) {
      continue;
    }
    const blocked = capacity.blackoutRanges.some(
      (range) =>
        compareDateStrings(date, range.start) >= 0 &&
        compareDateStrings(date, range.end) <= 0
    );
    if (blocked) {
      continue;
    }
    available += 1;
  }
  return available;
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

export function getGoalHorizonEndDate(startDate: string): string | null {
  if (!isIsoDate(startDate)) {
    return null;
  }
  const [yearPart, monthPart] = startDate.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const endMonthIndex = month - 1 + MAX_HORIZON_MONTHS - 1;
  const endYear = year + Math.floor(endMonthIndex / 12);
  const endMonth = (endMonthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  return `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export function resolveGoalPlanningEndDate({
  frequencyType,
  targetCount,
  startDate,
  endDate,
  asOfDate,
}: Pick<
  GoalDefinitionValidationInput,
  "frequencyType" | "targetCount" | "startDate" | "endDate" | "asOfDate"
>) {
  if (isIsoDate(endDate)) {
    return endDate;
  }
  if (
    !isOrdinalGoalDefinition({
      frequencyType,
      targetCount,
    })
  ) {
    return null;
  }
  if (!isIsoDate(startDate)) {
    return null;
  }
  const normalizedAsOfDate = asOfDate ?? null;
  const horizonAnchor =
    isIsoDate(normalizedAsOfDate) &&
    compareDateStrings(normalizedAsOfDate, startDate) > 0
      ? normalizedAsOfDate
      : startDate;
  return getGoalHorizonEndDate(horizonAnchor);
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
  const planningEndDate = resolveGoalPlanningEndDate(input);
  if (!isIsoDate(input.startDate) || !isIsoDate(planningEndDate)) {
    return issues;
  }
  if (compareDateStrings(input.startDate, planningEndDate) > 0) {
    issues.push({
      code: "invalid_date_range",
      message: "End date cannot be before start date.",
    });
    return issues;
  }
  const monthSpan = enumerateMonthsInWindow({
    start: input.startDate,
    end: planningEndDate,
  }).length;
  if (monthSpan > MAX_HORIZON_MONTHS) {
    issues.push({
      code: "horizon_too_long",
      message: `Goal deadlines cannot span more than ${MAX_HORIZON_MONTHS} calendar months.`,
    });
  }
  const exceedsTargetLimit =
    isOrdinalGoalDefinition(input) &&
    typeof input.targetCount === "number" &&
    input.targetCount > MAX_GOAL_TARGET_COUNT;
  if (exceedsTargetLimit) {
    issues.push({
      code: "target_exceeds_limit",
      message: `Target count cannot exceed ${MAX_GOAL_TARGET_COUNT}.`,
    });
  }
  if (
    input.capacity &&
    !exceedsTargetLimit &&
    isOrdinalGoalDefinition(input) &&
    typeof input.targetCount === "number"
  ) {
    const windowStart =
      input.asOfDate && compareDateStrings(input.asOfDate, input.startDate) > 0
        ? input.asOfDate
        : input.startDate;
    const available = countAvailableDays(
      { start: windowStart, end: planningEndDate },
      input.capacity
    );
    if (input.targetCount > available) {
      issues.push({
        code: "target_exceeds_capacity",
        message: `Only ${available} available days before ${planningEndDate} with your current rest days and blackout ranges — ${input.targetCount} sessions likely won't all fit. Lower the target, extend the end date, or free up rest days.`,
      });
    }
  }
  return issues;
}
