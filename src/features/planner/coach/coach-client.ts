import type {
  CoachConversationDetailPayload,
  CoachConversationListPayload,
  CoachMessage,
  CoachResponsePayload,
  PlannerErrorPayload,
} from "@/features/planner/calendar-surface.types";

function readPlannerErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message.trim().length > 0
  ) {
    return payload.message;
  }
  return fallback;
}

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
  const response = await fetch("/api/planner/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scopeMonth,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      focusGoalIds,
      deterministicSummary,
    }),
  });
  const payload = (await response.json()) as
    | (CoachResponsePayload & PlannerErrorPayload)
    | PlannerErrorPayload;
  if (!response.ok) {
    throw new Error(readPlannerErrorMessage(payload, "Coach response failed."));
  }
  return payload as CoachResponsePayload;
}

export async function listPlannerCoachConversations({
  scopeMonth,
  limit = 20,
}: {
  scopeMonth: string;
  limit?: number;
}): Promise<CoachConversationListPayload["conversations"]> {
  const query = new URLSearchParams({
    scopeMonth,
    limit: `${limit}`,
  });
  const response = await fetch(`/api/planner/coach/conversations?${query.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json()) as
    | CoachConversationListPayload
    | PlannerErrorPayload;
  if (!response.ok) {
    throw new Error(
      readPlannerErrorMessage(payload, "Saved conversations could not be loaded.")
    );
  }
  return (payload as CoachConversationListPayload).conversations ?? [];
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
  const response = await fetch("/api/planner/coach/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scopeMonth,
      timezone,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        proposal: message.proposal ?? null,
      })),
    }),
  });
  const payload = (await response.json()) as
    | {
        conversation?: CoachConversationListPayload["conversations"][number];
      }
    | PlannerErrorPayload;
  if (
    !response.ok ||
    !(payload as { conversation?: CoachConversationListPayload["conversations"][number] })
      .conversation
  ) {
    throw new Error(
      readPlannerErrorMessage(payload, "Coach conversation could not be saved.")
    );
  }
  return (
    payload as {
      conversation: CoachConversationListPayload["conversations"][number];
    }
  ).conversation;
}

export async function restorePlannerCoachConversation(conversationId: string) {
  const response = await fetch(`/api/planner/coach/conversations/${conversationId}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json()) as
    | CoachConversationDetailPayload
    | PlannerErrorPayload;
  if (!response.ok) {
    throw new Error(
      readPlannerErrorMessage(payload, "Saved conversation could not be restored.")
    );
  }
  return payload as CoachConversationDetailPayload;
}
