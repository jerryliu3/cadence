import type {
  CoachConversationDetailPayload,
  CoachConversationListPayload,
  CoachMessage,
  CoachResponsePayload,
  PlannerErrorPayload,
} from "@/features/planner/calendar-surface.types";
import {
  getApiErrorMessage,
  getJson,
  postJson,
  putJson,
} from "@/lib/api/client";
import type { PlannerPolicy } from "@/lib/planner/policy";

export async function requestPlannerCoachReply({
  scopeMonth,
  messages,
  focusGoalIds,
  deterministicSummary,
}: {
  scopeMonth: string;
  messages: CoachMessage[];
  focusGoalIds: string[];
  deterministicSummary: string;
}): Promise<CoachResponsePayload> {
  try {
    return await postJson<CoachResponsePayload>("/api/planner/coach", {
      scopeMonth,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      focusGoalIds,
      deterministicSummary,
    });
  } catch (error) {
    throw new Error(getApiErrorMessage(error, "Coach response failed."));
  }
}

export async function listPlannerCoachConversations({
  scopeMonth,
  limit = 20,
}: {
  scopeMonth: string;
  limit?: number;
}): Promise<CoachConversationListPayload["conversations"]> {
  try {
    const payload = await getJson<CoachConversationListPayload>(
      "/api/planner/coach/conversations",
      {
        query: { scopeMonth, limit },
      }
    );
    return payload.conversations ?? [];
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, "Saved conversations could not be loaded.")
    );
  }
}

export async function savePlannerCoachConversation({
  scopeMonth,
  timezone,
  messages,
}: {
  scopeMonth: string;
  timezone: string;
  messages: CoachMessage[];
}) {
  const payload = await postJson<{
    conversation?: CoachConversationListPayload["conversations"][number];
  }>("/api/planner/coach/conversations", {
    scopeMonth,
    timezone,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      proposal: message.proposal ?? null,
    })),
  }).catch((error: unknown) => {
    throw new Error(
      getApiErrorMessage(error, "Coach conversation could not be saved.")
    );
  });
  if (!payload.conversation) {
    throw new Error("Coach conversation could not be saved.");
  }
  return payload.conversation;
}

export async function restorePlannerCoachConversation(conversationId: string) {
  try {
    return await getJson<CoachConversationDetailPayload>(
      `/api/planner/coach/conversations/${conversationId}`
    );
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, "Saved conversation could not be restored.")
    );
  }
}

export async function persistPlannerDefaultPolicy({
  timezone,
  defaultPolicy,
}: {
  timezone: string;
  defaultPolicy: PlannerPolicy;
}) {
  const payload = await putJson<
    PlannerErrorPayload & {
      preferences?: {
        timezone: string;
        policyRevision: number;
        timezoneConfirmedAt: string;
        defaultPolicy: PlannerPolicy;
      };
    }
  >("/api/planner/context", {
    timezone,
    defaultPolicy,
  }).catch((error: unknown) => {
    throw new Error(
      getApiErrorMessage(error, "Planner preferences could not be updated.")
    );
  });
  return payload.preferences ?? null;
}
