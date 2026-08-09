import type { Database } from "@/lib/supabase/database.types";

type GoalFrequencyType = Database["public"]["Enums"]["goal_frequency_type"];
type ParticipantRole = Database["public"]["Enums"]["participant_role"];
type RecurrenceInterval = Database["public"]["Enums"]["recurrence_interval"];

export interface GoalMutationPayload {
  id?: string;
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
  default_local_time: string | null;
  is_group: boolean;
  is_deleted?: boolean;
}

export interface GoalPatchPayload {
  title?: string;
  description?: string | null;
  category?: string;
  color?: string | null;
  frequency_type?: GoalFrequencyType;
  recurrence_interval?: RecurrenceInterval | null;
  target_count?: number | null;
  milestone_names?: string[] | null;
  start_date?: string;
  end_date?: string | null;
  default_local_time?: string | null;
  is_group?: boolean;
  is_deleted?: boolean;
  archived_at?: string | null;
  photo_path?: string | null;
}

export interface CreateGoalRequestBody {
  goal: GoalMutationPayload;
  addOwnerParticipant?: boolean;
}

export interface UpdateGoalRequestBody {
  goalId: string;
  updates: GoalPatchPayload;
}

export interface CreateGoalsBulkRequestBody {
  goals: GoalMutationPayload[];
}

export interface ReplaceGoalLinkRequestBody {
  sourceGoalId: string;
  targetGoalId: string | null;
}

export interface CreateGoalLinksBulkRequestBody {
  links: Array<{
    sourceGoalId: string;
    targetGoalId: string;
  }>;
}

export interface UpdateProfileRequestBody {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface CreateGoalSharesRequestBody {
  goalIds: string[];
  sharedWithUserId: string;
}

export interface DeleteGoalShareRequestBody {
  goalId: string;
  sharedWithUserId: string;
}

export interface AddGoalParticipantRequestBody {
  goalId: string;
  userId: string;
  role?: ParticipantRole;
}

export interface RemoveGoalParticipantRequestBody {
  goalId: string;
  userId: string;
}
