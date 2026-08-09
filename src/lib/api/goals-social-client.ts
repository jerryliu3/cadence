import {
  postJson,
  putJson,
  requestJson,
} from "@/lib/api/client";
import type {
  AddGoalParticipantRequestBody,
  CreateGoalLinksBulkRequestBody,
  CreateGoalRequestBody,
  CreateGoalsBulkRequestBody,
  CreateGoalSharesRequestBody,
  DeleteGoalShareRequestBody,
  GoalMutationPayload,
  GoalPatchPayload,
  RemoveGoalParticipantRequestBody,
  ReplaceGoalLinkRequestBody,
  UpdateGoalRequestBody,
  UpdateProfileRequestBody,
} from "@/lib/api/goals-social-contract";

export async function createGoal({
  goal,
  addOwnerParticipant = false,
}: {
  goal: GoalMutationPayload;
  addOwnerParticipant?: boolean;
}) {
  return postJson<{ goalId: string }, CreateGoalRequestBody>("/api/goals", {
    goal,
    addOwnerParticipant,
  });
}

export async function updateGoal({
  goalId,
  updates,
}: {
  goalId: string;
  updates: GoalPatchPayload;
}) {
  return requestJson<{ goalId: string }, UpdateGoalRequestBody>({
    path: "/api/goals",
    method: "PATCH",
    body: { goalId, updates },
  });
}

export async function createGoalsBulk(goals: GoalMutationPayload[]) {
  return postJson<{ goalIds: string[] }, CreateGoalsBulkRequestBody>(
    "/api/goals/bulk",
    { goals }
  );
}

export async function replaceGoalLink({
  sourceGoalId,
  targetGoalId,
}: {
  sourceGoalId: string;
  targetGoalId: string | null;
}) {
  return putJson<{ success: boolean }, ReplaceGoalLinkRequestBody>(
    "/api/goal-links",
    {
    sourceGoalId,
    targetGoalId,
    }
  );
}

export async function createGoalLinksBulk(
  links: CreateGoalLinksBulkRequestBody["links"]
) {
  if (links.length === 0) {
    return { success: true as const };
  }
  return postJson<{ success: boolean }, CreateGoalLinksBulkRequestBody>(
    "/api/goal-links",
    { links }
  );
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
  return putJson<{ success: boolean }, UpdateProfileRequestBody>("/api/profiles", {
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
  return postJson<{ sharedCount: number }, CreateGoalSharesRequestBody>(
    "/api/goal-shares",
    {
      goalIds,
      sharedWithUserId,
    }
  );
}

export async function deleteGoalShare({
  goalId,
  sharedWithUserId,
}: {
  goalId: string;
  sharedWithUserId: string;
}) {
  return requestJson<{ success: boolean }, DeleteGoalShareRequestBody>({
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
  role?: AddGoalParticipantRequestBody["role"];
}) {
  return postJson<{ success: boolean }, AddGoalParticipantRequestBody>(
    "/api/goal-participants",
    {
    goalId,
    userId,
    role,
    }
  );
}

export async function removeGoalParticipant({
  goalId,
  userId,
}: {
  goalId: string;
  userId: string;
}) {
  return requestJson<{ success: boolean }, RemoveGoalParticipantRequestBody>({
    path: "/api/goal-participants",
    method: "DELETE",
    body: { goalId, userId },
  });
}
