import { isEntryImmovableForDraft } from "@/features/planner/calendar-format";
import type {
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";

export type DraftMoveDecision =
  | { ok: true; scheduledDate: string }
  | { ok: false; message: string };

/**
 * Decide whether a drag is allowed, and what to say when it is not.
 *
 * Kept separate from the calendar surface so every rejection path is reachable
 * in a test: these are the checks that stop a move before it becomes a pin, and
 * a pin the solver cannot honor fails much later and much less legibly.
 */
export function decideDraftMove({
  entry,
  nextDate,
  baselineUnit,
  moveConflictByGoalDate,
  completionFactUnitsByGoalDate,
  isValidIsoDate,
}: {
  entry: PlannerDayDetailEntry;
  nextDate: string;
  baselineUnit: PlannerWorkUnit | undefined;
  moveConflictByGoalDate: Map<string, Set<string>>;
  completionFactUnitsByGoalDate: Map<string, PlannerWorkUnit[]>;
  isValidIsoDate: (value: string) => boolean;
}): DraftMoveDecision {
  if (entry.draftGhost) {
    return {
      ok: false,
      message: "Original-date preview markers cannot be moved directly.",
    };
  }

  const scheduledDate = nextDate.trim();
  if (!isValidIsoDate(scheduledDate)) {
    return { ok: false, message: "Pick a valid move date." };
  }

  if (isEntryImmovableForDraft(entry)) {
    return {
      ok: false,
      message:
        "Completed or historical sessions cannot move in preview mode. Clear completion in the saved plan first.",
    };
  }

  if (!baselineUnit) {
    return {
      ok: false,
      message: "This session is unavailable in the current preview.",
    };
  }

  const moveWindow = baselineUnit.draftMoveWindow ?? baselineUnit.placementWindow;
  if (!moveWindow) {
    return {
      ok: false,
      message: "This session does not have a movable placement window.",
    };
  }

  if (scheduledDate < moveWindow.start) {
    return {
      ok: false,
      message: `This session can only move on or after ${moveWindow.start}.`,
    };
  }
  if (scheduledDate > moveWindow.end) {
    const creditWindowEnd = baselineUnit.creditWindow?.end ?? moveWindow.end;
    return {
      ok: false,
      message:
        scheduledDate > creditWindowEnd
          ? `That date is after this session's credit window end (${creditWindowEnd}), which usually reflects the goal end date or cadence period boundary.`
          : `That date is outside this session's allowed planner window (${moveWindow.start} to ${moveWindow.end}).`,
    };
  }

  const collisionKey = `${entry.originalGoalId}:${scheduledDate}`;

  const conflictKeys = moveConflictByGoalDate.get(collisionKey);
  if (conflictKeys && (conflictKeys.size > 1 || !conflictKeys.has(entry.key))) {
    return {
      ok: false,
      message: "That goal already has a planner session on the selected date.",
    };
  }

  const completionFactConflict = (
    completionFactUnitsByGoalDate.get(collisionKey) ?? []
  ).find((unit) => unit.unitKey !== entry.unitKey);
  if (completionFactConflict) {
    return {
      ok: false,
      message:
        completionFactConflict.scheduledDate &&
        completionFactConflict.scheduledDate !== scheduledDate
          ? `That goal is already marked done on ${scheduledDate} (credited from the ${completionFactConflict.scheduledDate} session).`
          : "That date already has a completion fact for this goal.",
    };
  }

  return { ok: true, scheduledDate };
}
