import type {
  PlannerContextPayload,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import type { DraftCommandState } from "@/features/planner/draft-command-reducer";
import { selectDraftCommands } from "@/features/planner/draft-command-reducer";
import {
  draftCommandEntryKey,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import {
  tryBuildPlannerDraftSaveWindow,
  type PlannerDraftSaveWindowResult,
} from "@/lib/planner/draft-window";
import type { PlannerPolicy } from "@/lib/planner/policy";

interface DraftSessionModelArgs {
  context: PlannerContextPayload | null;
  draftPreview: NonNullable<PlannerContextPayload["preview"]> | null;
  draftPolicy: PlannerPolicy | null;
  draftCommandState: DraftCommandState;
  currentScopeMonth: string | null;
}

export interface PlannerDraftSessionModel {
  effectiveDraftPolicy: PlannerPolicy | null;
  effectivePreview: NonNullable<PlannerContextPayload["preview"]> | null;
  draftSaveCommands: PlannerDraftCommand[];
  hasDraftSession: boolean;
  draftWindowWorkUnits: PlannerWorkUnit[];
  draftWindowUnitByEntryKey: Map<string, PlannerWorkUnit>;
  draftSaveWindowResult: PlannerDraftSaveWindowResult;
  draftSaveWindow: { start: string; end: string } | null;
  draftWindowTooWide: boolean;
}

function buildDraftWindowUnitByEntryKey(workUnits: PlannerWorkUnit[]) {
  const units = new Map<string, PlannerWorkUnit>();
  for (const unit of workUnits) {
    const key = draftCommandEntryKey({
      goalId: unit.originalGoalId,
      unitKey: unit.unitKey,
    });
    const existing = units.get(key);
    if (existing?.scheduledDate && !unit.scheduledDate) {
      continue;
    }
    units.set(key, unit);
  }
  return units;
}

export function selectPlannerDraftSessionModel({
  context,
  draftPreview,
  draftPolicy,
  draftCommandState,
  currentScopeMonth,
}: DraftSessionModelArgs): PlannerDraftSessionModel {
  const effectiveDraftPolicy = draftPolicy;
  const effectivePreview = draftPreview ?? context?.preview ?? null;
  const draftSaveCommands = sortPlannerDraftCommands(
    selectDraftCommands(draftCommandState)
  );
  const draftWindowWorkUnits = [
    ...(context?.preview?.workUnits ?? []),
    ...(effectivePreview?.workUnits ?? []),
  ];
  const draftWindowUnitByEntryKey =
    buildDraftWindowUnitByEntryKey(draftWindowWorkUnits);
  const hasDraftSession =
    draftSaveCommands.length > 0 || effectiveDraftPolicy !== null;

  const draftSaveWindowResult = currentScopeMonth
    ? tryBuildPlannerDraftSaveWindow({
        currentMonth: currentScopeMonth,
        commands: draftSaveCommands,
        workUnits: draftWindowWorkUnits,
      })
    : { ok: false as const, code: "empty" as const };

  const draftSaveWindow = draftSaveWindowResult.ok
    ? draftSaveWindowResult.window
    : null;
  const draftWindowTooWide =
    !draftSaveWindowResult.ok && draftSaveWindowResult.code === "too_wide";

  return {
    effectiveDraftPolicy,
    effectivePreview,
    draftSaveCommands,
    hasDraftSession,
    draftWindowWorkUnits,
    draftWindowUnitByEntryKey,
    draftSaveWindowResult,
    draftSaveWindow,
    draftWindowTooWide,
  };
}
