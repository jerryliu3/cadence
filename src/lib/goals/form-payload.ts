import {
  type CategorySelection,
  getCategoryLabel,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import { normalizeMilestoneNamesForSave } from "@/lib/goals/milestones";
import type { GoalFrequencyType, RecurrenceInterval } from "@/lib/goals/types";
import {
  isValidHexColor,
  parseGoalTargetCount,
} from "@/lib/goals/form-parsing";

export interface GoalFormPayloadInput {
  title: string;
  description: string;
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
}

export interface BuildGoalPayloadOptions {
  ownerId: string;
  goalId?: string;
  includeDeletedFlag?: boolean;
  fallbackInvalidHexColor?: boolean;
}

export function buildGoalRowPayload(
  fields: GoalFormPayloadInput,
  options: BuildGoalPayloadOptions
) {
  const parsedTargetCount = parseGoalTargetCount(fields.target_count);
  const normalizedTargetCount =
    fields.frequency_type === "fixed_milestones"
      ? parsedTargetCount
      : parsedTargetCount !== null && parsedTargetCount > 0
        ? parsedTargetCount
        : null;

  const milestoneNames =
    fields.frequency_type === "fixed_milestones" &&
    parsedTargetCount !== null &&
    parsedTargetCount > 0
      ? normalizeMilestoneNamesForSave(parsedTargetCount, fields.milestone_names)
      : null;

  const color = options.fallbackInvalidHexColor
    ? isValidHexColor(fields.color)
      ? fields.color.trim()
      : getCategorySwatchColor(fields.category_selection)
    : fields.color;

  return {
    ...(options.goalId ? { id: options.goalId } : {}),
    owner_id: options.ownerId,
    title: fields.title.trim(),
    description: fields.description.trim() || null,
    category: getCategoryLabel(
      fields.category_selection,
      fields.custom_category
    ),
    color,
    frequency_type: fields.frequency_type,
    recurrence_interval:
      fields.frequency_type === "recurring" ? fields.recurrence_interval : null,
    target_count: normalizedTargetCount,
    milestone_names: milestoneNames,
    start_date: fields.start_date,
    end_date: fields.end_date || null,
    default_local_time: fields.default_local_time.trim() || null,
    is_group: fields.is_group,
    ...(options.includeDeletedFlag ? { is_deleted: false } : {}),
  };
}
