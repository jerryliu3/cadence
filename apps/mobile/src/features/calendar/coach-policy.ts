import type {
  PlannerPolicySnapshot,
  PlannerWorkUnit,
} from "@cadence/shared/planner/context";
import {
  upsertMobilePlannerDraftMove,
  type MobilePlannerDraftState,
} from "./mobile-planner-draft";

export type CoachPolicyPatch =
  | { kind: "set_rest_weekdays"; restWeekdays: number[] }
  | { kind: "add_blackout_range"; start: string; end: string }
  | { kind: "remove_blackout_range"; start: string; end: string }
  | {
      kind: "move_session";
      goalId: string;
      unitKey: string;
      scheduledDate: string;
    };

export type MobilePlannerPolicy = PlannerPolicySnapshot;

export function applyCoachPolicyPatches({
  policy,
  patches,
}: {
  policy: PlannerPolicySnapshot;
  patches: CoachPolicyPatch[];
}): { policy: PlannerPolicySnapshot; appliedPatchCount: number } {
  const nextPolicy: PlannerPolicySnapshot = {
    ...policy,
    restWeekdays: [...(policy.restWeekdays ?? [])],
    blackoutRanges: [...(policy.blackoutRanges ?? [])],
  };
  let appliedPatchCount = 0;

  for (const patch of patches) {
    if (patch.kind === "set_rest_weekdays") {
      const normalized = Array.from(new Set(patch.restWeekdays)).sort(
        (left, right) => left - right
      );
      nextPolicy.restWeekdays = normalized;
      appliedPatchCount += 1;
      continue;
    }
    if (patch.kind === "add_blackout_range") {
      const exists = nextPolicy.blackoutRanges.some(
        (range) => range.start === patch.start && range.end === patch.end
      );
      if (!exists) {
        nextPolicy.blackoutRanges.push({ start: patch.start, end: patch.end });
        appliedPatchCount += 1;
      }
      continue;
    }
    if (patch.kind === "remove_blackout_range") {
      const before = nextPolicy.blackoutRanges.length;
      nextPolicy.blackoutRanges = nextPolicy.blackoutRanges.filter(
        (range) => range.start !== patch.start || range.end !== patch.end
      );
      if (nextPolicy.blackoutRanges.length !== before) {
        appliedPatchCount += 1;
      }
    }
  }

  return { policy: nextPolicy, appliedPatchCount };
}

export function applyCoachPatchesToMobileDraft({
  state,
  policy,
  workUnits,
  patches,
}: {
  state: MobilePlannerDraftState;
  policy: MobilePlannerPolicy;
  workUnits: PlannerWorkUnit[];
  patches: CoachPolicyPatch[];
}) {
  const policyResult = applyCoachPolicyPatches({ policy, patches });
  let nextState =
    policyResult.appliedPatchCount > 0
      ? {
          ...state,
          policy: policyResult.policy,
          preview: null,
          previewWindow: null,
          dirty: true,
        }
      : state;
  let queuedSessionMoves = 0;
  let missingSessionMoves = 0;
  for (const patch of patches) {
    if (patch.kind !== "move_session") {
      continue;
    }
    const unit = workUnits.find(
      (candidate) =>
        candidate.originalGoalId === patch.goalId &&
        candidate.unitKey === patch.unitKey
    );
    if (!unit?.scheduledDate) {
      missingSessionMoves += 1;
      continue;
    }
    nextState = upsertMobilePlannerDraftMove({
      state: nextState,
      unit,
      scheduledDate: patch.scheduledDate,
    });
    queuedSessionMoves += 1;
  }
  return {
    state: nextState,
    appliedPolicyPatchCount: policyResult.appliedPatchCount,
    queuedSessionMoves,
    missingSessionMoves,
  };
}
