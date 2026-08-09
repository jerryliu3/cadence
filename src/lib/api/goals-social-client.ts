import {
  postJson,
  putJson,
  requestJson,
} from "@/lib/api/client";
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

export async function createGoal({
  goal,
  addOwnerParticipant = false,
}: {
  goal: GoalMutationPayload;
  addOwnerParticipant?: boolean;
}) {
  return postJson<{ goalId: string }>(
    "/api/goals",
    { goal, addOwnerParticipant }
  );
}

export async function updateGoal({
  goalId,
  updates,
}: {
  goalId: string;
  updates: GoalPatchPayload;
}) {
  return requestJson<{ goalId: string }, { goalId: string; updates: GoalPatchPayload }>({
    path: "/api/goals",
    method: "PATCH",
    body: {
      goalId,
      updates,
    },
  });
}

export async function createGoalsBulk(goals: GoalMutationPayload[]) {
  return postJson<{ goalIds: string[] }>("/api/goals/bulk", { goals });
}

export async function replaceGoalLink({
  sourceGoalId,
  targetGoalId,
}: {
  sourceGoalId: string;
  targetGoalId: string | null;
}) {
  return putJson<{ success: boolean }>("/api/goal-links", {
    sourceGoalId,
    targetGoalId,
  });
}

export async function createGoalLinksBulk(
  links: { sourceGoalId: string; targetGoalId: string }[]
) {
  if (links.length === 0) {
    return { success: true as const };
  }
  return postJson<{ success: boolean }>("/api/goal-links", { links });
}

export async function updateProfile({
  username,
  displayName,
  avatarUrl,
}: {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  return putJson<{ success: boolean }>("/api/profiles", {
    username,
    displayName,
    avatarUrl,
  });
}

export async function createGoalShares({
  goalIds,
  sharedWithUserId,
}: {
  goalIds: string[];
  sharedWithUserId: string;
}) {
  return postJson<{ sharedCount: number }>("/api/goal-shares", {
    goalIds,
    sharedWithUserId,
  });
}

export async function deleteGoalShare({
  goalId,
  sharedWithUserId,
}: {
  goalId: string;
  sharedWithUserId: string;
}) {
  return requestJson<
    { success: boolean },
    { goalId: string; sharedWithUserId: string }
  >({
    path: "/api/goal-shares",
    method: "DELETE",
    body: {
      goalId,
      sharedWithUserId,
    },
  });
}

export async function addGoalParticipant({
  goalId,
  userId,
  role,
}: {
  goalId: string;
  userId: string;
  role?: ParticipantRole;
}) {
  return postJson<{ success: boolean }>("/api/goal-participants", {
    goalId,
    userId,
    role,
  });
}

export async function removeGoalParticipant({
  goalId,
  userId,
}: {
  goalId: string;
  userId: string;
}) {
  return requestJson<{ success: boolean }, { goalId: string; userId: string }>({
    path: "/api/goal-participants",
    method: "DELETE",
    body: { goalId, userId },
  });
}
