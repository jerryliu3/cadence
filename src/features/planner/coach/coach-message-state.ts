import type {
  CoachConversationSummary,
  CoachGoalDraftMessageProposal,
  CoachMessage,
  CoachMessageProposal,
  CoachPolicyMessageProposal,
} from "@/features/planner/calendar-surface.types";

export function isCoachGoalDraftProposal(
  proposal: CoachMessageProposal
): proposal is CoachGoalDraftMessageProposal {
  return "kind" in proposal && proposal.kind === "goal_draft";
}

export function isCoachPolicyProposal(
  proposal: CoachMessageProposal
): proposal is CoachPolicyMessageProposal {
  return !isCoachGoalDraftProposal(proposal);
}

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

export function readAssistantMessageWithProposal({
  messages,
  messageIndex,
}: {
  messages: CoachMessage[];
  messageIndex: number;
}) {
  const message = messages[messageIndex];
  if (
    !message ||
    message.role !== "assistant" ||
    !message.proposal ||
    !isCoachPolicyProposal(message.proposal)
  ) {
    return null;
  }

  if (!Array.isArray(message.proposal.policyPatches)) {
    return null;
  }

  return message as CoachMessage & {
    role: "assistant";
    proposal: CoachPolicyMessageProposal;
  };
}

export function updateAssistantProposalStatus({
  messages,
  messageIndex,
  applyStatus,
  appliedMoveEntryKeys,
}: {
  messages: CoachMessage[];
  messageIndex: number;
  applyStatus: CoachPolicyMessageProposal["applyStatus"];
  appliedMoveEntryKeys?: string[];
}) {
  const target = messages[messageIndex];
  if (
    !target ||
    target.role !== "assistant" ||
    !target.proposal ||
    !isCoachPolicyProposal(target.proposal)
  ) {
    return { changed: false, nextMessages: messages };
  }

  const nextProposal: CoachPolicyMessageProposal = {
    ...target.proposal,
    applyStatus,
    ...(appliedMoveEntryKeys ? { appliedMoveEntryKeys } : {}),
  };
  const nextMessages: CoachMessage[] = messages.map((message, index) =>
    index === messageIndex ? { ...message, proposal: nextProposal } : message
  );

  return { changed: true, nextMessages };
}

export function markAppliedProposalsUndone(messages: CoachMessage[]) {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (
      message.proposal &&
      isCoachPolicyProposal(message.proposal) &&
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
