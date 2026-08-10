import type { PlannerKernelOutput } from "@/lib/planner/kernel";

export interface DraftPinViolation {
  entryKey: string;
  goalId: string;
  unitKey: string;
  expectedDate: string;
  actualDate: string | null;
}

export function findUnhonoredDraftPins({
  workUnits,
  draftPinnedDates,
}: {
  workUnits: PlannerKernelOutput["workUnits"];
  draftPinnedDates: Record<string, string>;
}) {
  if (Object.keys(draftPinnedDates).length === 0) {
    return [] as DraftPinViolation[];
  }
  const scheduledByEntryKey = new Map(
    workUnits.map((unit) => [
      `${unit.originalGoalId}:${unit.unitKey}`,
      unit.scheduledDate ?? null,
    ])
  );
  const violations: DraftPinViolation[] = [];
  for (const [entryKey, expectedDate] of Object.entries(draftPinnedDates)) {
    const separatorIndex = entryKey.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === entryKey.length - 1) {
      continue;
    }
    const actualDate = scheduledByEntryKey.get(entryKey) ?? null;
    if (actualDate === expectedDate) {
      continue;
    }
    violations.push({
      entryKey,
      goalId: entryKey.slice(0, separatorIndex),
      unitKey: entryKey.slice(separatorIndex + 1),
      expectedDate,
      actualDate,
    });
  }
  return violations;
}
