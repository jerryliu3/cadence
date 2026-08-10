import { draftCommandEntryKey } from "@/lib/planner/draft-commands";

interface DiffableWorkUnit {
  originalGoalId: string;
  unitKey: string;
  scheduledDate: string | null;
}

export interface ReplanMove {
  entryKey: string;
  goalId: string;
  unitKey: string;
  scheduledDate: string;
}

/**
 * Turn a `replan` proposal into the pins that should be written.
 *
 * The proposal is scratch -- it is never stored as the draft, because publish
 * always solves `stable` and its hash would not match. Only these pins persist,
 * which is what makes a coach change survive the next recompute instead of
 * evaporating on the following stable solve.
 *
 * A unit the proposal leaves unplaced is skipped rather than pinned to null:
 * `move_item` with a null date carries no pin, so writing one would claim an
 * edit that does nothing.
 */
export function buildReplanMoves({
  baselineWorkUnits,
  proposalWorkUnits,
}: {
  baselineWorkUnits: DiffableWorkUnit[];
  proposalWorkUnits: DiffableWorkUnit[];
}): ReplanMove[] {
  const baselineDateByEntryKey = new Map(
    baselineWorkUnits.map((unit) => [
      draftCommandEntryKey({
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
      }),
      unit.scheduledDate,
    ])
  );

  const moves: ReplanMove[] = [];
  for (const unit of proposalWorkUnits) {
    const entryKey = draftCommandEntryKey({
      goalId: unit.originalGoalId,
      unitKey: unit.unitKey,
    });
    const scheduledDate = unit.scheduledDate;
    if (
      scheduledDate === null ||
      baselineDateByEntryKey.get(entryKey) === scheduledDate
    ) {
      continue;
    }
    moves.push({
      entryKey,
      goalId: unit.originalGoalId,
      unitKey: unit.unitKey,
      scheduledDate,
    });
  }
  return moves;
}
