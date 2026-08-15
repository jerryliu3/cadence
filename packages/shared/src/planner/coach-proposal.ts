import type { PlannerPolicySnapshot } from "./context";
import { canonicalHash } from "./canonical";

export type CoachProposalPolicyPatch =
  | { kind: "set_rest_weekdays"; restWeekdays: number[] }
  | { kind: "add_blackout_range"; start: string; end: string }
  | { kind: "remove_blackout_range"; start: string; end: string }
  | {
      kind: "move_session";
      goalId: string;
      unitKey: string;
      scheduledDate: string;
    };

export type CoachProposalApplyStatus =
  | "not_applied"
  | "auto_applied"
  | "manually_applied"
  | "undone";

export interface CoachMessageProposal<
  TPatch extends CoachProposalPolicyPatch = CoachProposalPolicyPatch,
> {
  schemaVersion: "1";
  applyStatus: CoachProposalApplyStatus;
  patchSignature: string;
  baselineSnapshotToken: string;
  baselinePolicy: PlannerPolicySnapshot | null;
  policyPatches: TPatch[];
  appliedMoveEntryKeys: string[];
  unresolvedQuestions: string[];
}

export function buildCoachProposalSignature(
  patches: CoachProposalPolicyPatch[]
) {
  return canonicalHash({ policyPatches: patches });
}

export function buildCoachBaselineSnapshotToken(
  policy: PlannerPolicySnapshot
) {
  return `policy:${canonicalHash(policy)}`;
}

export function buildCoachMessageProposal<
  TPatch extends CoachProposalPolicyPatch,
>({
  policyPatches,
  unresolvedQuestions,
  baselinePolicy,
  applyStatus,
  appliedMoveEntryKeys = [],
}: {
  policyPatches: TPatch[];
  unresolvedQuestions: string[];
  baselinePolicy: PlannerPolicySnapshot | null;
  applyStatus: CoachProposalApplyStatus;
  appliedMoveEntryKeys?: string[];
}): CoachMessageProposal<TPatch> | null {
  if (policyPatches.length === 0) {
    return null;
  }
  const patchSignature = buildCoachProposalSignature(policyPatches);
  return {
    schemaVersion: "1",
    applyStatus,
    patchSignature,
    baselineSnapshotToken: baselinePolicy
      ? buildCoachBaselineSnapshotToken(baselinePolicy)
      : `missing:${patchSignature.slice(0, 32)}`,
    baselinePolicy,
    policyPatches,
    appliedMoveEntryKeys,
    unresolvedQuestions,
  };
}
