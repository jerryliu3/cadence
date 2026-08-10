import { draftCommandEntryKey } from "@/lib/planner/draft-commands";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";

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
}): DraftPinViolation[] {
  const pinnedEntries = Object.entries(draftPinnedDates);
  if (pinnedEntries.length === 0) {
    return [];
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
  for (const [entryKey, expectedDate] of pinnedEntries) {
    const actualDate = scheduledByEntryKey.get(entryKey) ?? null;
    if (actualDate === expectedDate) {
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
  return violations;
}
