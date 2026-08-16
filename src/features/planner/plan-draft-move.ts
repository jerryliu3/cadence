import { isValidDate } from "@cadence/shared/planner/calendar-state";
import { isEntryImmovableForDraft } from "@/features/planner/calendar-format";
import type {
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";

export type PlanDraftMoveResult =
  | { ok: true; scheduledDate: string }
  | { ok: false; message: string };

export function planDraftMove({
  entry,
  nextDate,
  scopeMonth,
  previewUnit,
  conflictKeys,
  completionFactConflict,
}: {
  entry: PlannerDayDetailEntry;
  nextDate: string;
  scopeMonth: string | null;
  previewUnit: PlannerWorkUnit | undefined;
  conflictKeys: Set<string> | undefined;
  completionFactConflict:
    | { unitKey: string; scheduledDate: string | null }
    | undefined;
}): PlanDraftMoveResult {
  if (entry.draftGhost) {
    return {
      ok: false,
      message: "Original-date preview markers cannot be moved directly.",
    };
  }
  const normalized = nextDate.trim();
  if (!isValidDate(normalized)) {
    return { ok: false, message: "Pick a valid move date." };
  }
  if (!scopeMonth) {
    return { ok: false, message: "Planner context is unavailable." };
  }
  if (isEntryImmovableForDraft(entry)) {
    return {
      ok: false,
      message:
        "Completed sessions cannot move in preview mode. Clear completion in the saved plan first.",
    };
  }
  if (entry.activeItem?.locked) {
    return {
      ok: false,
      message: "Unlock this session before moving it.",
    };
  }
  if (!previewUnit) {
    return {
      ok: false,
      message: "This session is unavailable in the current preview.",
    };
  }
  if (previewUnit.locked) {
    return {
      ok: false,
      message: "Unlock this session before moving it.",
    };
  }
  const moveWindow = previewUnit.draftMoveWindow ?? previewUnit.placementWindow;
  if (!moveWindow) {
    return {
      ok: false,
      message: "This session does not have a movable placement window.",
    };
  }
  if (normalized < moveWindow.start || normalized > moveWindow.end) {
    const creditWindowEnd = previewUnit.creditWindow?.end ?? moveWindow.end;
    if (normalized < moveWindow.start) {
      return {
        ok: false,
        message: `This session can only move on or after ${moveWindow.start}.`,
      };
    }
    if (normalized > creditWindowEnd) {
      return {
        ok: false,
        message: `That date is after this session's credit window end (${creditWindowEnd}), which usually reflects the goal end date or cadence period boundary.`,
      };
    }
    return {
      ok: false,
      message: `That date is outside this session's allowed planner window (${moveWindow.start} to ${moveWindow.end}).`,
    };
  }
  if (conflictKeys && (conflictKeys.size > 1 || !conflictKeys.has(entry.key))) {
    return {
      ok: false,
      message: "That goal already has a planner session on the selected date.",
    };
  }
  if (completionFactConflict && completionFactConflict.unitKey !== entry.unitKey) {
    if (
      completionFactConflict.scheduledDate &&
      completionFactConflict.scheduledDate !== normalized
    ) {
      return {
        ok: false,
        message: `That goal is already marked done on ${normalized} (credited from the ${completionFactConflict.scheduledDate} session).`,
      };
    }
    return {
      ok: false,
      message: "That date already has a completion fact for this goal.",
    };
  }

  return { ok: true, scheduledDate: normalized };
}
