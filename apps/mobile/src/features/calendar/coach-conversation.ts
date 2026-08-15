import {
  buildCoachMessageProposal,
  type CoachMessageProposal,
} from "@cadence/shared/planner/coach-proposal";
import type { PlannerPolicySnapshot } from "@cadence/shared/planner/context";
import type { CoachPolicyPatch } from "./coach-policy";

export interface MobileCoachMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  proposal?: CoachMessageProposal<CoachPolicyPatch> | null;
}

export function buildMobileCoachProposal({
  policyPatches,
  unresolvedQuestions,
  baselinePolicy,
}: {
  policyPatches: CoachPolicyPatch[];
  unresolvedQuestions: string[];
  baselinePolicy: PlannerPolicySnapshot | null;
}) {
  return buildCoachMessageProposal({
    policyPatches,
    unresolvedQuestions,
    baselinePolicy,
    applyStatus: "not_applied",
  });
}

export function serializeMobileCoachMessages(messages: MobileCoachMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(message.role === "assistant" && message.proposal
      ? { proposal: message.proposal }
      : {}),
  }));
}

export function restoreMobileCoachMessages(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt?: number;
    proposal?: CoachMessageProposal<CoachPolicyPatch> | null;
  }>
): MobileCoachMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt ?? Date.now(),
    ...(message.role === "assistant" && message.proposal
      ? { proposal: message.proposal }
      : {}),
  }));
}

export function markMobileCoachProposalApplied(
  messages: MobileCoachMessage[],
  messageIndex: number
) {
  return messages.map((message, index) =>
    index === messageIndex && message.proposal
      ? {
          ...message,
          proposal: {
            ...message.proposal,
            applyStatus: "manually_applied" as const,
          },
        }
      : message
  );
}
