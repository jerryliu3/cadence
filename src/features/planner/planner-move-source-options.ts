import type {
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { MoveSourceOption } from "@/features/planner/move-session-dialog";
import { planDraftMove } from "@/features/planner/plan-draft-move";

export type MoveSourceCandidate = MoveSourceOption & { entry: PlannerDayDetailEntry };

interface BuildMoveSourceOptionsArgs {
  targetDay: string | null;
  scopeMonth: string | null;
  moveDialogEntriesForTargetDay: PlannerDayDetailEntry[];
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  draftWindowUnitByEntryKey: Map<
    string,
    NonNullable<PlannerContextPayload["preview"]>["workUnits"][number]
  >;
  canMutateEntryOnDay: (entry: PlannerDayDetailEntry, day: string | null) => boolean;
  getEntryDisplayTitleWithTime: (entry: PlannerDayDetailEntry) => string;
}

export function buildMoveSourceOptions({
  targetDay,
  scopeMonth,
  moveDialogEntriesForTargetDay,
  entriesByDate,
  draftWindowUnitByEntryKey,
  canMutateEntryOnDay,
  getEntryDisplayTitleWithTime,
}: BuildMoveSourceOptionsArgs): MoveSourceCandidate[] {
  if (!targetDay || !scopeMonth) {
    return [];
  }
  const scheduledGoalIds = new Set(
    moveDialogEntriesForTargetDay
      .filter((entry) => !entry.draftGhost)
      .map((entry) => entry.originalGoalId)
  );
  const options: MoveSourceCandidate[] = [];
  for (const [day, entries] of entriesByDate.entries()) {
    if (day === targetDay) {
      continue;
    }
    for (const entry of entries) {
      if (
        entry.draftGhost ||
        !entry.activeItem ||
        !canMutateEntryOnDay(entry, day) ||
        scheduledGoalIds.has(entry.originalGoalId)
      ) {
        continue;
      }
      const previewUnit = draftWindowUnitByEntryKey.get(entry.key);
      if (!previewUnit) {
        continue;
      }
      const planned = planDraftMove({
        entry,
        nextDate: targetDay,
        scopeMonth,
        previewUnit,
        conflictKeys: undefined,
        completionFactConflict: undefined,
      });
      if (!planned.ok) {
        continue;
      }
      options.push({
        entryKey: entry.key,
        sourceDay: day,
        sourceLabel: getEntryDisplayTitleWithTime(entry),
        entry,
      });
    }
  }
  return options.sort((left, right) => {
    const dayCompare = left.sourceDay.localeCompare(right.sourceDay);
    if (dayCompare !== 0) {
      return dayCompare;
    }
    return left.sourceLabel.localeCompare(right.sourceLabel);
  });
}
