import type {
  CoachConversationSummary,
  CoachMessage,
  CoachMessageProposal,
} from "@/features/planner/calendar-surface.types";

export function upsertConversationSummary({
  previous,
  conversation,
}: {
  previous: CoachConversationSummary[];
  conversation: CoachConversationSummary;
}) {
  const remaining = previous.filter((item) => item.id !== conversation.id);
  return [conversation, ...remaining];
}

export function updateAssistantProposalStatus({
  messages,
  messageIndex,
  applyStatus,
  appliedMoveEntryKeys,
}: {
  messages: CoachMessage[];
  messageIndex: number;
  applyStatus: CoachMessageProposal["applyStatus"];
  appliedMoveEntryKeys?: string[];
}) {
  const target = messages[messageIndex];
  if (!target || target.role !== "assistant" || !target.proposal) {
    return { changed: false, nextMessages: messages };
  }

  const nextMessages = messages.map((message, index) =>
    index === messageIndex
      ? {
          ...message,
          proposal: {
            ...message.proposal!,
            applyStatus,
            ...(appliedMoveEntryKeys ? { appliedMoveEntryKeys } : {}),
          },
        }
      : message
  );

  return { changed: true, nextMessages };
}

export function markAppliedProposalsUndone(messages: CoachMessage[]) {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (
      message.proposal &&
      (message.proposal.applyStatus === "auto_applied" ||
        message.proposal.applyStatus === "manually_applied")
    ) {
      changed = true;
      return {
        ...message,
        proposal: {
          ...message.proposal,
          applyStatus: "undone" as const,
        },
      };
    }
    return message;
  });

  return { changed, nextMessages: changed ? nextMessages : messages };
}
