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

const GOALS_BULK_BATCH_SIZE = 50;
const GOAL_LINKS_BULK_BATCH_SIZE = 200;
const GOAL_WRITE_TIMEOUT_MS = 45_000;

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [];
  }
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

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
  }, {
    timeoutMs: GOAL_WRITE_TIMEOUT_MS,
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
  if (goals.length === 0) {
    return { goalIds: [] as string[] };
  }

  const goalIds: string[] = [];
  for (const goalsBatch of chunk(goals, GOALS_BULK_BATCH_SIZE)) {
    const payload = await postJson<{ goalIds: string[] }, CreateGoalsBulkRequestBody>(
      "/api/goals/bulk",
      { goals: goalsBatch },
      { timeoutMs: GOAL_WRITE_TIMEOUT_MS }
    );
    goalIds.push(...payload.goalIds);
  }
  return { goalIds };
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
  for (const linksBatch of chunk(links, GOAL_LINKS_BULK_BATCH_SIZE)) {
    await postJson<{ success: boolean }, CreateGoalLinksBulkRequestBody>(
      "/api/goal-links",
      { links: linksBatch }
    );
  }
  return { success: true as const };
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
