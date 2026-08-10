import { draftCommandEntryKey } from "@/lib/planner/draft-commands";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";

function isPinnableUnit(unit: PlannerKernelOutput["workUnits"][number]) {
  return (
    unit.creditState === "uncredited" &&
    (unit.classification === "open" || unit.classification === "future")
  );
}

export interface DraftPinViolation {
  goalId: string;
  unitKey: string;
  expectedDate: string;
  actualDate: string | null;
}

/**
 * Draft `move_item` commands are solver inputs, not a post-solve overlay. This
 * asserts the contract: every pinned unit must come back on its pinned date.
 * A violation means the pin was dropped (locked unit, infeasible placement),
 * so the caller must fail loudly rather than publish a schedule nobody chose.
 */
export function findUnhonoredDraftPins({
  workUnits,
  draftPinnedDates,
}: {
  workUnits: PlannerKernelOutput["workUnits"];
  draftPinnedDates: Record<string, string>;
}): { violations: DraftPinViolation[]; stalePins: string[] } {
  const pinnedEntries = Object.entries(draftPinnedDates);
  if (pinnedEntries.length === 0) {
    return { violations: [], stalePins: [] };
  }
  const scheduledByEntryKey = new Map(
    workUnits.map((unit) => [
      draftCommandEntryKey({
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
      }),
      unit.scheduledDate ?? null,
    ])
  );
  const violations: DraftPinViolation[] = [];
  const stalePins: string[] = [];
  const unitByEntryKey = new Map(
    workUnits.map((unit) => [
      draftCommandEntryKey({
        goalId: unit.originalGoalId,
        unitKey: unit.unitKey,
      }),
      unit,
    ])
  );
  for (const [entryKey, expectedDate] of pinnedEntries) {
    const actualDate = scheduledByEntryKey.get(entryKey) ?? null;
    if (actualDate === expectedDate) {
      continue;
    }
    // A pin whose unit vanished or is no longer movable -- typically because a
    // completion was recorded after the move -- never reached the solver, so
    // the preview is already correct. Reporting it would strand the user on an
    // error they can only clear by discarding the whole draft.
    const unit = unitByEntryKey.get(entryKey);
    if (!unit || !isPinnableUnit(unit)) {
      stalePins.push(entryKey);
      continue;
    }
    const separatorIndex = entryKey.indexOf(":");
    violations.push({
      goalId: entryKey.slice(0, separatorIndex),
      unitKey: entryKey.slice(separatorIndex + 1),
      expectedDate,
      actualDate,
    });
  }
  return { violations, stalePins };
}
