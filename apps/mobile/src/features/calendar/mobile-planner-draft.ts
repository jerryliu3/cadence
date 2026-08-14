import {
  plannerDraftWindowUnavailableMessage,
  tryBuildPlannerDraftSaveWindow,
} from "@cadence/shared/planner/draft-window";
import {
  createMoveItemDraftCommand,
  type PlannerMoveItemDraftCommand,
} from "@cadence/shared/planner/reorder-preview-entries";
import type { PlannerDateWindow } from "@cadence/shared/planner/visible-window";
import type {
  MobilePlannerContext,
  MobilePlannerWorkUnit,
} from "./planner-context-loader";

export class MobilePlannerDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobilePlannerDraftError";
  }
}

export interface MobilePlannerDraftState {
  commands: PlannerMoveItemDraftCommand[];
  preview: MobilePlannerContext["preview"];
  previewWindow: PlannerDateWindow | null;
  policy: unknown | null;
  dirty: boolean;
}

interface MobilePlannerDraftApiClient {
  postJson(path: string, body: Record<string, unknown>): Promise<unknown>;
}

export function createEmptyMobilePlannerDraft(): MobilePlannerDraftState {
  return {
    commands: [],
    preview: null,
    previewWindow: null,
    policy: null,
    dirty: false,
  };
}

export function upsertMobilePlannerDraftMove({
  state,
  unit,
  scheduledDate,
}: {
  state: MobilePlannerDraftState;
  unit: MobilePlannerWorkUnit;
  scheduledDate: string;
}): MobilePlannerDraftState {
  const existingIndex = state.commands.findIndex(
    (command) =>
      command.goalId === unit.originalGoalId &&
      command.unitKey === unit.unitKey
  );
  const existing = state.commands[existingIndex];
  const sourceDate = existing?.sourceDate ?? unit.scheduledDate;
  if (!sourceDate) {
    throw new MobilePlannerDraftError(
      "This session is unavailable in the current preview."
    );
  }
  const command = existing
    ? { ...existing, scheduledDate }
    : createMoveItemDraftCommand({
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
        scheduledDate,
        sourceDate,
        sequence:
          state.commands.reduce(
            (largest, candidate) => Math.max(largest, candidate.sequence),
            -1
          ) + 1,
      });
  const commands = [...state.commands];
  if (existingIndex >= 0) {
    commands[existingIndex] = command;
  } else {
    commands.push(command);
  }
  return {
    ...state,
    commands,
    preview: null,
    previewWindow: null,
    dirty: true,
  };
}

export async function previewMobilePlannerDraft({
  client,
  context,
  currentMonth,
  state,
}: {
  client: MobilePlannerDraftApiClient;
  context: MobilePlannerContext;
  currentMonth: string;
  state: MobilePlannerDraftState;
}): Promise<MobilePlannerDraftState> {
  const windowResult = tryBuildPlannerDraftSaveWindow({
    currentMonth,
    commands: state.commands,
    workUnits:
      state.preview?.workUnits ?? context.preview?.workUnits ?? [],
  });
  if (!windowResult.ok) {
    throw new MobilePlannerDraftError(
      plannerDraftWindowUnavailableMessage(windowResult)
    );
  }
  const policy = state.policy ?? context.preferences?.defaultPolicy ?? null;
  const response = (await client.postJson("/api/planner/context", {
    startDate: windowResult.window.start,
    endDate: windowResult.window.end,
    timezone: context.timezone,
    policy,
    source: context.activePlan ? "update" : "manual",
    solveIntent: "stable",
    draftCommands: state.commands,
  })) as { preview?: MobilePlannerContext["preview"] };
  if (!response.preview) {
    throw new MobilePlannerDraftError("Planner preview is unavailable.");
  }
  return {
    ...state,
    preview: response.preview,
    previewWindow: windowResult.window,
    dirty: state.commands.length > 0 || state.policy !== null,
  };
}

export async function publishMobilePlannerDraft({
  client,
  context,
  state,
}: {
  client: MobilePlannerDraftApiClient;
  context: MobilePlannerContext;
  state: MobilePlannerDraftState;
}) {
  const expectedDigest = context.revisions.scheduleDigest;
  const previewHash = state.preview?.generationInputHash;
  if (!expectedDigest || !previewHash || !state.previewWindow) {
    throw new MobilePlannerDraftError(
      "Refresh the planner preview before saving."
    );
  }
  return client.postJson("/api/planner/save", {
    expectedDigest,
    startDate: state.previewWindow.start,
    endDate: state.previewWindow.end,
    previewHash,
    eligibilityMode: state.preview?.eligibilityMode,
    confirmationHash: null,
    policy: state.policy ?? context.preferences?.defaultPolicy,
    preserveExistingAssignments:
      state.preview?.preserveExistingAssignments,
    draftCommands: state.commands,
  });
}
