import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  parse,
  startOfMonth,
} from "date-fns";
import { isValidDate, isValidMonth } from "./calendar-state";
import type { PlannerDateWindow } from "./visible-window";
import type { PlannerMoveItemDraftCommand } from "./reorder-preview-entries";

const MAX_PLANNER_WINDOW_DAYS = 366;

export const PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE =
  "That date is more than 12 months from this draft. Save first, then move further.";

export type PlannerDraftWindowFailure = "empty" | "too_wide" | "invalid";

export type PlannerDraftWindowResult =
  | { ok: true; window: PlannerDateWindow }
  | { ok: false; code: PlannerDraftWindowFailure };

export function plannerDraftWindowUnavailableMessage(
  result: PlannerDraftWindowResult
) {
  return result.ok === false && result.code === "too_wide"
    ? PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
    : "Planner context is unavailable.";
}

function monthWindow(month: string): PlannerDateWindow {
  if (!isValidMonth(month)) {
    throw new RangeError("Invalid planner month.");
  }
  const parsed = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  return {
    start: format(startOfMonth(parsed), "yyyy-MM-dd"),
    end: format(endOfMonth(parsed), "yyyy-MM-dd"),
  };
}

function monthFromDate(date: string) {
  if (!isValidDate(date)) {
    throw new RangeError("Invalid planner date.");
  }
  return date.slice(0, 7);
}

export function tryWindowCoveringMonths(
  months: string[]
): PlannerDraftWindowResult {
  if (months.length === 0) {
    return { ok: false, code: "empty" };
  }
  try {
    const windows = months.map(monthWindow);
    const start = windows.reduce(
      (earliest, next) => (next.start < earliest ? next.start : earliest),
      windows[0]!.start
    );
    const end = windows.reduce(
      (latest, next) => (next.end > latest ? next.end : latest),
      windows[0]!.end
    );
    const days =
      differenceInCalendarDays(
        parse(end, "yyyy-MM-dd", new Date()),
        parse(start, "yyyy-MM-dd", new Date())
      ) + 1;
    if (days > MAX_PLANNER_WINDOW_DAYS) {
      return { ok: false, code: "too_wide" };
    }
    return { ok: true, window: { start, end } };
  } catch {
    return { ok: false, code: "invalid" };
  }
}

export function tryBuildPlannerDraftSaveWindow({
  currentMonth,
  commands,
  workUnits,
}: {
  currentMonth: string;
  commands: PlannerMoveItemDraftCommand[];
  workUnits: Array<{
    originalGoalId: string;
    unitKey: string;
    scheduledDate: string | null;
  }>;
}): PlannerDraftWindowResult {
  const months = new Set<string>([currentMonth]);
  const commandedKeys = new Set(
    commands.map((command) => `${command.goalId}:${command.unitKey}`)
  );
  try {
    for (const command of commands) {
      months.add(monthFromDate(command.sourceDate));
      if (command.scheduledDate) {
        months.add(monthFromDate(command.scheduledDate));
      }
    }
    for (const unit of workUnits) {
      if (
        unit.scheduledDate &&
        commandedKeys.has(`${unit.originalGoalId}:${unit.unitKey}`)
      ) {
        months.add(monthFromDate(unit.scheduledDate));
      }
    }
  } catch {
    return { ok: false, code: "invalid" };
  }
  return tryWindowCoveringMonths(Array.from(months));
}
