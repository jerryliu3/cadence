import {
  buildCoachDeterministicSummary,
  buildCoachFocusGoalIds,
} from "@cadence/shared/planner/coach-context";
import {
  applyCoachPatchesToMobileDraft,
  type CoachPolicyPatch,
  type MobilePlannerPolicy,
} from "./coach-policy";
import {
  MobilePlannerDraftError,
  previewMobilePlannerDraft,
  replanMobilePlannerDraftPolicy,
  resolveMobilePlannerDraftWindow,
  type MobilePlannerDraftState,
} from "./mobile-planner-draft";
import type { MobilePlannerContext } from "./planner-context-loader";

export interface MobileCoachMessageInput {
  role: "user" | "assistant";
  content: string;
}

interface MobileCoachApiClient {
  postJson(path: string, body: Record<string, unknown>): Promise<unknown>;
  putJson(path: string, body: Record<string, unknown>): Promise<unknown>;
}

export function buildMobileCoachRequest({
  context,
  currentMonth,
  state,
  messages,
}: {
  context: MobilePlannerContext;
  currentMonth: string;
  state: MobilePlannerDraftState;
  messages: MobileCoachMessageInput[];
}) {
  const window = resolveMobilePlannerDraftWindow({
    context,
    currentMonth,
    state,
  });
  const workUnits =
    state.preview?.workUnits ?? context.preview?.workUnits ?? [];
  const focusGoalIds = buildCoachFocusGoalIds({
    workUnits,
    goalTitles: context.goalTitles,
  });
  return {
    startDate: window.start,
    endDate: window.end,
    scopeMonth: context.scopeMonth,
    messages,
    focusGoalIds,
    deterministicSummary: buildCoachDeterministicSummary({
      startDate: window.start,
      endDate: window.end,
      timezone: context.timezone,
      asOfDate: context.asOfDate,
      workUnits,
      focusGoalIds,
      goalTitles: context.goalTitles,
    }),
  };
}

export async function applyMobileCoachPatches({
  client,
  context,
  currentMonth,
  state,
  patches,
}: {
  client: MobileCoachApiClient;
  context: MobilePlannerContext;
  currentMonth: string;
  state: MobilePlannerDraftState;
  patches: CoachPolicyPatch[];
}) {
  const currentPolicy = context.preferences?.defaultPolicy as
    | MobilePlannerPolicy
    | undefined;
  if (!currentPolicy) {
    throw new MobilePlannerDraftError(
      "Confirm planner timezone on web before applying coach edits."
    );
  }
  const baselineWorkUnits =
    state.preview?.workUnits ?? context.preview?.workUnits ?? [];
  const applied = applyCoachPatchesToMobileDraft({
    state,
    policy: (state.policy as MobilePlannerPolicy | null) ?? currentPolicy,
    workUnits: baselineWorkUnits,
    patches,
  });
  if (
    applied.appliedPolicyPatchCount === 0 &&
    applied.queuedSessionMoves === 0
  ) {
    return {
      ...applied,
      policyReplanMoves: 0,
    };
  }

  let nextState = applied.state;
  let policyReplanMoves = 0;
  if (applied.appliedPolicyPatchCount > 0) {
    const replanned = await replanMobilePlannerDraftPolicy({
      client,
      context,
      currentMonth,
      state: nextState,
      baselineWorkUnits,
    });
    nextState = replanned.state;
    policyReplanMoves = replanned.moveCount;
  }
  nextState = await previewMobilePlannerDraft({
    client,
    context,
    currentMonth,
    state: nextState,
  });
  if (applied.appliedPolicyPatchCount > 0) {
    await client.putJson("/api/planner/context", {
      timezone: context.timezone,
      defaultPolicy: nextState.policy,
    });
  }
  return {
    ...applied,
    state: nextState,
    policyReplanMoves,
  };
}
