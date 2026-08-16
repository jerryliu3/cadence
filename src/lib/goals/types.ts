export type GoalFrequencyType = "fixed_milestones" | "recurring";
export type RecurrenceInterval = "daily" | "weekly" | "monthly";
export type CompletionSource = "manual" | "linked_cascade" | "external_sync";
export type DefaultMainPagePreference = "calendar" | "checklist" | "insights";
export type PlannerPrimaryTabPreference = "calendar" | "checklist";

export interface Goal {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: string;
  category_key?: string;
  is_private?: boolean;
  color: string | null;
  frequency_type: GoalFrequencyType;
  recurrence_interval: RecurrenceInterval | null;
  target_count: number | null;
  milestone_names: string[] | null;
  start_date: string;
  end_date: string | null;
  reward_text?: string | null;
  default_local_time?: string | null;
  photo_path: string | null;
  team_id: string | null;
  is_deleted: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Completion {
  id: string;
  goal_id: string;
  user_id: string;
  completed_on: string;
  source: CompletionSource;
  created_at: string;
}

export type CompletionDateFact = Pick<
  Completion,
  "goal_id" | "completed_on" | "source"
>;

export interface GoalLink {
  id: string;
  owner_id: string;
  source_goal_id: string;
  target_goal_id: string;
  created_at: string;
}

export interface GoalShare {
  id: string;
  goal_id: string;
  shared_with: string;
  created_at: string;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  default_main_page?: DefaultMainPagePreference | null;
  planner_primary_tab?: PlannerPrimaryTabPreference | null;
  week_starts_on?: number;
  social_activity_visible?: boolean;
  created_at: string;
}
