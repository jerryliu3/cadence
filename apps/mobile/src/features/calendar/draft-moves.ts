import { isValidDate } from "@cadence/shared/planner/calendar-state";
import { createMoveItemDraftCommand } from "@cadence/shared/planner/reorder-preview-entries";
import { getApiErrorMessage } from "@cadence/shared/api-client";
import { api } from "../../lib/api";
import type {
  MobilePlannerContext,
  MobilePlannerWorkUnit,
} from "./use-planner-context";

export class DraftMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftMoveError";
  }
}

export function resolveMoveScopeMonth({
  sourceMonth,
  nextDate,
  crossMonthMovesEnabled,
}: {
  sourceMonth: string;
  nextDate: string;
  crossMonthMovesEnabled: boolean;
}) {
  const targetMonth = nextDate.slice(0, 7);
  if (targetMonth === sourceMonth) {
    return { scopeMonth: sourceMonth, crossMonth: false };
  }
  if (!crossMonthMovesEnabled) {
    throw new DraftMoveError(
      "Cross-month moves are disabled. Open the destination month to place this session."
    );
  }
  return { scopeMonth: targetMonth, crossMonth: true };
}

export async function previewDraftMove({
  context,
  unit,
  nextDate,
  crossMonthMovesEnabled,
}: {
  context: MobilePlannerContext;
  unit: MobilePlannerWorkUnit;
  nextDate: string;
  crossMonthMovesEnabled: boolean;
}) {
  const normalized = nextDate.trim();
  if (!isValidDate(normalized)) {
    throw new DraftMoveError("Pick a valid move date.");
  }
  if (unit.creditState !== "uncredited") {
    throw new DraftMoveError(
      "Completed or historical sessions cannot move in preview mode."
    );
  }
  const moveWindow = unit.draftMoveWindow ?? unit.placementWindow;
  if (
    moveWindow &&
    (normalized < moveWindow.start || normalized > moveWindow.end)
  ) {
    throw new DraftMoveError(
      `That date is outside this session's allowed planner window (${moveWindow.start} to ${moveWindow.end}).`
    );
  }
  const { scopeMonth, crossMonth } = resolveMoveScopeMonth({
    sourceMonth: context.scopeMonth,
    nextDate: normalized,
    crossMonthMovesEnabled:
      crossMonthMovesEnabled ||
      Boolean(context.capabilities?.crossMonthMovesEnabled),
  });

  try {
    await api.postJson("/api/planner/context", {
      scopeMonth,
      timezone: context.timezone,
      policy: context.preferences?.defaultPolicy,
      source: context.activePlan ? "update" : "manual",
      solveIntent: "stable",
      draftCommands: [
        createMoveItemDraftCommand({
          goalId: unit.originalGoalId,
          unitKey: unit.unitKey,
          scheduledDate: normalized,
        }),
      ],
    });
  } catch (error) {
    throw new DraftMoveError(getApiErrorMessage(error, "Move failed."));
  }

  return { scopeMonth, crossMonth, scheduledDate: normalized };
}
