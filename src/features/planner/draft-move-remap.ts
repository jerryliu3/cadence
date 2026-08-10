export interface RemappableUnit {
  unitKey: string;
  ordinal: number;
  scheduledDate: string;
}

/**
 * Work out what a drag should pin.
 *
 * For interchangeable sessions, the user's intent is "this goal now occupies a
 * different set of dates", not "this exact ordinal must own this date forever."
 * So a drag remaps the goal's whole ordinal-to-date mapping to preserve the
 * date set the user sees in preview.
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
  kind,
}: {
  units: RemappableUnit[];
  movedUnitKey: string;
  nextDate: string;
  kind?: "milestone_sequence" | "cadence" | "deadline_total";
}): Record<string, string> {
  // Milestone labels are bound to the ordinal (`labels[ordinal - 1]`), so
  // relabelling would move the wrong item: drag "Outline" late and "Final"
  // lands on the new date. Pin only the dragged milestone so label identity
  // stays intact.
  if (kind === "milestone_sequence") {
    return { [movedUnitKey]: nextDate };
  }
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

/**
 * The pins a drag should write.
 *
 * Every unit in the mapping is pinned, including ones whose date does not
 * change. Dropping a pin because its date matches the current preview is
 * wrong: the preview shows that date *because* the pin is holding it. Removing
 * it hands the unit back to the solver, which re-minimises against the
 * published plan and slides it somewhere else -- so a second drag would
 * silently undo the first.
 */
export function buildDraftMoveCommands({
  units,
  movedUnitKey,
  nextDate,
  kind,
}: {
  units: RemappableUnit[];
  movedUnitKey: string;
  nextDate: string;
  kind?: "milestone_sequence" | "cadence" | "deadline_total";
}): Array<{ unitKey: string; scheduledDate: string }> {
  const remapped = remapGoalDatesForDraftMove({
    units,
    movedUnitKey,
    nextDate,
    kind,
  });
  return Object.entries(remapped)
    .map(([unitKey, scheduledDate]) => ({ unitKey, scheduledDate }))
    .sort((left, right) => left.unitKey.localeCompare(right.unitKey));
}
