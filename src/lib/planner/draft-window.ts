import { MAX_PLANNER_WINDOW_DAYS } from "@/lib/planner/contracts/bounds";
import {
  assertDateWindow,
  countDateWindowDays,
  getScopeDateRange,
  monthFromDate,
  type DateWindow,
} from "@/lib/planner/dates";
import {
  draftCommandEntryKey,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";

export const PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE =
  "That date is more than 12 months from this draft. Save first, then move further.";

export function plannerDraftWindowUnavailableMessage(
  result: PlannerDraftWindowResult
) {
  return result.ok === false && result.code === "too_wide"
    ? PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
    : "Planner context is unavailable.";
}

export type PlannerDraftWindowFailure = "empty" | "too_wide" | "invalid";

export type PlannerDraftWindowResult =
  | { ok: true; window: DateWindow }
  | { ok: false; code: PlannerDraftWindowFailure };

export type PlannerDraftSaveWindowInput = {
  currentMonth: string;
  commands: PlannerDraftCommand[];
  workUnits: Array<{
    originalGoalId: string;
    unitKey: string;
    scheduledDate: string | null;
  }>;
  extraMonths?: string[];
};

export function tryWindowCoveringMonths(
  months: string[]
): PlannerDraftWindowResult {
  if (months.length === 0) {
    return { ok: false, code: "empty" };
  }
  let windows: DateWindow[];
  try {
    windows = months.map((month) => getScopeDateRange(month));
  } catch {
    return { ok: false, code: "invalid" };
  }
  const window = {
    start: windows.reduce(
      (earliest, next) => (next.start < earliest ? next.start : earliest),
      windows[0].start
    ),
    end: windows.reduce(
      (latest, next) => (next.end > latest ? next.end : latest),
      windows[0].end
    ),
  };
  if (countDateWindowDays(window) > MAX_PLANNER_WINDOW_DAYS) {
    return { ok: false, code: "too_wide" };
  }
  try {
    return { ok: true, window: assertDateWindow(window) };
  } catch {
    return { ok: false, code: "invalid" };
  }
}

export function windowCoveringMonths(months: string[]): DateWindow {
  const result = tryWindowCoveringMonths(months);
  if (!result.ok) {
    throw new RangeError(
      result.code === "too_wide"
        ? `Planner window exceeds ${MAX_PLANNER_WINDOW_DAYS} days.`
        : result.code === "empty"
          ? "Planner window requires at least one month."
          : "Invalid planner window."
    );
  }
  return result.window;
}

function collectPlannerDraftMonths({
  currentMonth,
  commands,
  workUnits,
  extraMonths = [],
}: PlannerDraftSaveWindowInput): string[] {
  const months = new Set<string>([currentMonth, ...extraMonths]);
  const commandedKeys = new Set(
    commands.map((command) => draftCommandEntryKey(command))
  );
  for (const command of commands) {
    if (command.kind !== "move_item") {
      continue;
    }
    months.add(monthFromDate(command.sourceDate));
    if (command.scheduledDate) {
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
  return Array.from(months);
}

export function tryBuildPlannerDraftSaveWindow(
  input: PlannerDraftSaveWindowInput
): PlannerDraftWindowResult {
  return tryWindowCoveringMonths(collectPlannerDraftMonths(input));
}

export function buildPlannerDraftSaveWindow(
  input: PlannerDraftSaveWindowInput
): DateWindow {
  const result = tryBuildPlannerDraftSaveWindow(input);
  if (!result.ok) {
    throw new RangeError(
      result.code === "too_wide"
        ? `Planner window exceeds ${MAX_PLANNER_WINDOW_DAYS} days.`
        : result.code === "empty"
          ? "Planner window requires at least one month."
          : "Invalid planner window."
    );
  }
  return result.window;
}
