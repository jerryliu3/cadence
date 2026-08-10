import type {
  CategorySelection,
} from "@/lib/goals/category";
import {
  validateGoalDefinition,
} from "@/lib/goals/definition-validation";
import {
  deriveDefinitionTargetCount,
} from "@/lib/goals/form-derivations";
import {
  isValidHexColor,
  isValidLocalTime,
  parseGoalTargetCount,
} from "@/lib/goals/form-parsing";
import type {
  GoalFrequencyType,
  RecurrenceInterval,
} from "@/lib/goals/types";

export interface GoalFormValidationInput {
  title: string;
  category_selection: CategorySelection;
  custom_category: string;
  color: string;
  frequency_type: GoalFrequencyType;
  recurrence_interval: RecurrenceInterval;
  target_count: string;
  milestone_names: string[];
  start_date: string;
  end_date: string;
  default_local_time: string;
  is_group: boolean;
  linked_target_goal_id?: string;
}

export interface GoalFormValidationOptions {
  requireRecurrenceInterval?: boolean;
  validateHexColor?: boolean;
  validateMilestoneNameAlignment?: boolean;
  validateGroupLinkExclusion?: boolean;
  requireStartDate?: boolean;
}

export function validateGoalFormInput(
  input: GoalFormValidationInput,
  options: GoalFormValidationOptions = {}
): string[] {
  const errors: string[] = [];
  const parsedTarget = parseGoalTargetCount(input.target_count);

  if (!input.title.trim()) {
    errors.push("Title is required.");
  }

  if (
    options.requireRecurrenceInterval &&
    input.frequency_type === "recurring" &&
    !input.recurrence_interval
  ) {
    errors.push("Repeat goals require a recurrence interval.");
  }

  if (options.requireStartDate && input.start_date.trim().length === 0) {
    errors.push("Start date is required.");
  }

  if (
    input.frequency_type === "fixed_milestones" &&
    (parsedTarget === null || parsedTarget <= 0)
  ) {
    errors.push("Milestone goals require a positive target count.");
  }

  if (
    input.default_local_time.trim().length > 0 &&
    !isValidLocalTime(input.default_local_time)
  ) {
    errors.push("Default time must be a valid 24-hour HH:MM value.");
  }

  if (
    input.category_selection === "custom" &&
    input.custom_category.trim().length === 0
  ) {
    errors.push("Custom category name is required.");
  }

  if (options.validateHexColor && !isValidHexColor(input.color)) {
    errors.push("Color accent must be a valid hex color.");
  }

  if (
    options.validateMilestoneNameAlignment &&
    input.frequency_type === "fixed_milestones" &&
    parsedTarget !== null &&
    input.milestone_names.length !== parsedTarget
  ) {
    errors.push("Milestone names must align with target count.");
  }

  const definitionTargetCount = deriveDefinitionTargetCount({
    frequencyType: input.frequency_type,
    targetCountRaw: input.target_count,
    parsedTargetCount: parsedTarget,
  });
  for (const issue of validateGoalDefinition({
    frequencyType: input.frequency_type,
    targetCount: definitionTargetCount,
    startDate: input.start_date,
    endDate: input.end_date || null,
  })) {
    errors.push(issue.message);
  }

  if (
    options.validateGroupLinkExclusion &&
    input.is_group &&
    input.linked_target_goal_id &&
    input.linked_target_goal_id !== "none"
  ) {
    errors.push("Group goals cannot be linked to another goal.");
  }

  return errors;
}

export function getFirstGoalFormValidationError(
  input: GoalFormValidationInput,
  options: GoalFormValidationOptions = {}
): string | null {
  return validateGoalFormInput(input, options)[0] ?? null;
}
