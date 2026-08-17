import type {
  CoachPolicyMessageProposal,
  PlannerContextPayload,
} from "@/features/planner/calendar-surface.types";
import { buildBaselineSnapshotToken } from "@/features/planner/coach/coach-message-utils";
import { applyCoachPolicyPatches } from "@/features/planner/coach-policy";
import { plannerPolicySchema, type PlannerPolicy } from "@/lib/planner/policy";

type UndoValidationFailureReason =
  | "missing_preferences"
  | "missing_baseline"
  | "stale_draft_policy";

type UndoValidationFailure = {
  ok: false;
  reason: UndoValidationFailureReason;
};

type UndoValidationSuccess = {
  ok: true;
  baselinePolicy: PlannerPolicy;
  currentDraftPolicy: PlannerPolicy;
  shouldPersistDurableUndo: boolean;
};

export type UndoValidationResult = UndoValidationFailure | UndoValidationSuccess;

export function validateUndoProposal({
  proposal,
  preferences,
  effectiveDraftPolicy,
}: {
  proposal: CoachPolicyMessageProposal;
  preferences: PlannerContextPayload["preferences"] | null | undefined;
  effectiveDraftPolicy: PlannerPolicy | null;
}): UndoValidationResult {
  if (!preferences) {
    return { ok: false, reason: "missing_preferences" };
  }

  if (!proposal.baselinePolicy) {
    return { ok: false, reason: "missing_baseline" };
  }

  const baselinePolicy = plannerPolicySchema.parse(proposal.baselinePolicy);
  const expectedAppliedPolicy = applyCoachPolicyPatches({
    policy: baselinePolicy,
    patches: proposal.policyPatches,
  }).policy;
  const currentDraftPolicy = plannerPolicySchema.parse(
    effectiveDraftPolicy ?? preferences.defaultPolicy
  );

  if (
    buildBaselineSnapshotToken(currentDraftPolicy) !==
    buildBaselineSnapshotToken(expectedAppliedPolicy)
  ) {
    return { ok: false, reason: "stale_draft_policy" };
  }

  return {
    ok: true,
    baselinePolicy,
    currentDraftPolicy,
    shouldPersistDurableUndo: proposal.applyStatus === "manually_applied",
  };
}
