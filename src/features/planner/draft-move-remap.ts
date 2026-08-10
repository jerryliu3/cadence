export interface RemappableUnit {
  unitKey: string;
  ordinal: number;
  scheduledDate: string;
}

/**
 * Work out what a drag should pin.
 *
 * The solver assigns a goal's units in strict ordinal order, so pinning one
 * ordinal to a later date drags every later ordinal after it. That ordering is
 * real for `milestone_sequence` -- step 2 must follow step 1 -- but for
 * interchangeable sessions it is bookkeeping, and honouring it literally means
 * moving one session visibly shifts every session after it.
 *
 * What the user actually changed is the set of dates the goal occupies: one
 * date is released, another is taken. So recompute the whole ordinal-to-date
 * mapping from the new date set. Ordinal labels shuffle, but exactly one date
 * changes hands, which is what the calendar shows.
 *
 * Returns the full pin set for the goal: unitKey -> the date it should hold.
 */
export function remapGoalDatesForDraftMove({
  units,
  movedUnitKey,
  nextDate,
}: {
  units: RemappableUnit[];
  movedUnitKey: string;
  nextDate: string;
}): Record<string, string> {
  const ordered = [...units].sort((left, right) =>
    left.ordinal !== right.ordinal
      ? left.ordinal - right.ordinal
      : left.unitKey.localeCompare(right.unitKey)
  );
  if (!ordered.some((unit) => unit.unitKey === movedUnitKey)) {
    return { [movedUnitKey]: nextDate };
  }

  const nextDates = ordered
    .map((unit) =>
      unit.unitKey === movedUnitKey ? nextDate : unit.scheduledDate
    )
    .sort();

  const pinnedDates: Record<string, string> = {};
  ordered.forEach((unit, index) => {
    pinnedDates[unit.unitKey] = nextDates[index];
  });
  return pinnedDates;
}
