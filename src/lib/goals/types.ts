export type GoalFrequencyType = "fixed_milestones" | "recurring";
export type RecurrenceInterval = "daily" | "weekly" | "monthly";
export type CompletionSource = "manual" | "linked_cascade";
export type ParticipantRole = "owner" | "participant";

export interface Goal {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: string;
  color: string | null;
  frequency_type: GoalFrequencyType;
  recurrence_interval: RecurrenceInterval | null;
  target_count: number | null;
  milestone_names: string[] | null;
  start_date: string;
  end_date: string | null;
  default_local_time?: string | null;
  photo_path: string | null;
  is_group: boolean;
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

export interface GoalParticipant {
  id: string;
  goal_id: string;
  user_id: string;
  role: ParticipantRole;
  joined_at: string;
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
  week_starts_on?: number;
  weekly_anchor_effective_on?: string;
  created_at: string;
}
