import {
  assertDateWindow,
  getScopeDateRange,
  monthFromDate,
  type DateWindow,
} from "@/lib/planner/dates";
import {
  draftCommandEntryKey,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";

export function windowCoveringMonths(months: string[]): DateWindow {
  if (months.length === 0) {
    throw new RangeError("Planner window requires at least one month.");
  }
  const windows = months.map((month) => getScopeDateRange(month));
  return assertDateWindow({
    start: windows.reduce(
      (earliest, window) => (window.start < earliest ? window.start : earliest),
      windows[0].start
    ),
    end: windows.reduce(
      (latest, window) => (window.end > latest ? window.end : latest),
      windows[0].end
    ),
  });
}

export function buildPlannerDraftSaveWindow({
  currentMonth,
  commands,
  workUnits,
  extraMonths = [],
}: {
  currentMonth: string;
  commands: PlannerDraftCommand[];
  workUnits: Array<{
    originalGoalId: string;
    unitKey: string;
    scheduledDate: string | null;
  }>;
  extraMonths?: string[];
}): DateWindow {
  const months = new Set<string>([currentMonth, ...extraMonths]);
  const commandedKeys = new Set(
    commands.map((command) => draftCommandEntryKey(command))
  );
  for (const command of commands) {
    if (command.kind === "move_item" && command.scheduledDate) {
      months.add(monthFromDate(command.scheduledDate));
    }
  }
  for (const unit of workUnits) {
    if (!unit.scheduledDate) {
      continue;
    }
    if (
      commandedKeys.has(
        draftCommandEntryKey({
          goalId: unit.originalGoalId,
          unitKey: unit.unitKey,
        })
      )
    ) {
      months.add(monthFromDate(unit.scheduledDate));
    }
  }
  return windowCoveringMonths(Array.from(months));
}
