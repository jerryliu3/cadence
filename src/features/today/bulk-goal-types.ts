import type { CategorySelection } from "@/lib/goals/category";
import type { GoalFrequencyType, RecurrenceInterval } from "@/lib/goals/types";

export interface BulkGoalDraft {
  id: string;
  sourceRowLabel: string;
  include: boolean;
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
  linked_target_goal_id: string;
  link_target_search: string;
  link_target_open: boolean;
  advanced_open: boolean;
  photo_file: File | null;
  errors: string[];
}

export type BulkInputMode = "natural_language" | "csv";
