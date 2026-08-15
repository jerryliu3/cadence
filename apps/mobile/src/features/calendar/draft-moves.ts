import { isValidDate } from "@cadence/shared/planner/calendar-state";
import type { PlannerWorkUnit } from "@cadence/shared/planner/context";
import {
  upsertMobilePlannerDraftMove,
  type MobilePlannerDraftState,
} from "./mobile-planner-draft";

export class DraftMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftMoveError";
  }
}

export function planMobileDraftMove({
  state,
  currentMonth,
  unit,
  nextDate,
}: {
  state: MobilePlannerDraftState;
  currentMonth: string;
  unit: PlannerWorkUnit;
  nextDate: string;
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
  const targetMonth = normalized.slice(0, 7);
  return {
    state: upsertMobilePlannerDraftMove({
      state,
      unit,
      scheduledDate: normalized,
    }),
    targetMonth,
    crossMonth: targetMonth !== currentMonth,
    scheduledDate: normalized,
  };
}
