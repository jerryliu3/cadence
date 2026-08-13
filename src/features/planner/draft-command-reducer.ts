import { createClientUuid } from "@/features/planner/calendar-format";
import {
  draftCommandEntryKey,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";

export interface ScopedPlannerDraftCommand {
  scopeMonth: string;
  command: PlannerDraftCommand;
}

export interface DraftCommandState {
  commands: ScopedPlannerDraftCommand[];
  nextSequence: number;
}

export type DraftCommandAction =
  | {
      type: "upsert_move";
      scopeMonth: string;
      goalId: string;
      unitKey: string;
      scheduledDate: string | null;
    }
  | {
      type: "upsert_rename";
      scopeMonth: string;
      goalId: string;
      unitKey: string;
      label: string | null;
    }
  | {
      type: "upsert_time_override";
      scopeMonth: string;
      goalId: string;
      unitKey: string;
      localTime: string;
    }
  | {
      type: "clear_time_override";
      scopeMonth: string;
      goalId: string;
      unitKey: string;
    }
  | {
      type: "remove_kind";
      scopeMonth: string;
      kind:
        | "move_item"
        | "rename_item"
        | "set_item_time_override"
        | "clear_item_time_override";
      goalId: string;
      unitKey: string;
    }
  | {
      type: "remove_entries";
      scopeMonth: string;
      entries: Array<{ goalId: string; unitKey: string }>;
    }
  | {
      type: "remove_scope";
      scopeMonth: string;
    }
  | { type: "clear" };

export const initialDraftCommandState: DraftCommandState = {
  commands: [],
  nextSequence: 0,
};

function commandTargetsEntry(
  scopedCommand: ScopedPlannerDraftCommand,
  scopeMonth: string,
  goalId: string,
  unitKey: string
) {
  const command = scopedCommand.command;
  return (
    scopedCommand.scopeMonth === scopeMonth &&
    command.goalId === goalId &&
    "unitKey" in command &&
    command.unitKey === unitKey
  );
}

export function draftCommandReducer(
  state: DraftCommandState,
  action: DraftCommandAction
): DraftCommandState {
  if (action.type === "clear") {
    return initialDraftCommandState;
  }

  if (action.type === "remove_kind") {
    return {
      ...state,
      commands: state.commands.filter(
        (command) =>
          !(
            command.command.kind === action.kind &&
            commandTargetsEntry(
              command,
              action.scopeMonth,
              action.goalId,
              action.unitKey
            )
          )
      ),
    };
  }
  if (action.type === "remove_entries") {
    const keys = new Set(
      action.entries.map((entry) => `${entry.goalId}:${entry.unitKey}`)
    );
    if (keys.size === 0) {
      return state;
    }
    return {
      ...state,
      commands: state.commands.filter((command) => {
        if (command.scopeMonth !== action.scopeMonth) {
          return true;
        }
        if (!("unitKey" in command.command)) {
          return true;
        }
        return !keys.has(`${command.command.goalId}:${command.command.unitKey}`);
      }),
    };
  }
  if (action.type === "remove_scope") {
    return {
      ...state,
      commands: state.commands.filter(
        (command) => command.scopeMonth !== action.scopeMonth
      ),
    };
  }

  const actionKind =
    action.type === "upsert_move"
      ? "move_item"
      : action.type === "upsert_rename"
        ? "rename_item"
        : action.type === "upsert_time_override"
          ? "set_item_time_override"
          : "clear_item_time_override";

  const existingIndex = state.commands.findIndex(
    (command) =>
      command.command.kind === actionKind &&
      commandTargetsEntry(
        command,
        action.scopeMonth,
        action.goalId,
        action.unitKey
      )
  );

  if (existingIndex >= 0) {
    const existing = state.commands[existingIndex];
    const existingCommand = existing.command;
    const identity = {
      id: existingCommand.id,
      sequence: existingCommand.sequence,
      goalId: existingCommand.goalId,
      unitKey: action.unitKey,
    };
    const nextCommand: PlannerDraftCommand =
      action.type === "upsert_move"
        ? {
            ...identity,
            kind: "move_item",
            scheduledDate: action.scheduledDate,
          }
        : action.type === "upsert_rename"
          ? {
            ...identity,
            kind: "rename_item",
            label: action.label,
          }
          : action.type === "upsert_time_override"
            ? {
                ...identity,
                kind: "set_item_time_override",
                localTime: action.localTime,
              }
            : {
                ...identity,
                kind: "clear_item_time_override",
              };
    const nextCommands = [...state.commands];
    nextCommands[existingIndex] = {
      ...existing,
      scopeMonth: action.scopeMonth,
      command: nextCommand,
    };
    return {
      ...state,
      commands: nextCommands,
    };
  }

  const nextSequence = state.nextSequence + 1;
  const nextCommand: PlannerDraftCommand =
    action.type === "upsert_move"
      ? {
          id: createClientUuid(),
          sequence: nextSequence,
          kind: "move_item",
          goalId: action.goalId,
          unitKey: action.unitKey,
          scheduledDate: action.scheduledDate,
        }
      : action.type === "upsert_rename"
        ? {
            id: createClientUuid(),
            sequence: nextSequence,
            kind: "rename_item",
            goalId: action.goalId,
            unitKey: action.unitKey,
            label: action.label,
          }
        : action.type === "upsert_time_override"
          ? {
              id: createClientUuid(),
              sequence: nextSequence,
              kind: "set_item_time_override",
              goalId: action.goalId,
              unitKey: action.unitKey,
              localTime: action.localTime,
            }
          : {
              id: createClientUuid(),
              sequence: nextSequence,
              kind: "clear_item_time_override",
              goalId: action.goalId,
              unitKey: action.unitKey,
            };

  return {
    commands: [
      ...state.commands,
      {
        scopeMonth: action.scopeMonth,
        command: nextCommand,
      },
    ],
    nextSequence,
  };
}

export function selectDraftCommandsForScope(
  state: DraftCommandState,
  scopeMonth: string | null | undefined
) {
  if (!scopeMonth) {
    return [] as PlannerDraftCommand[];
  }
  return state.commands
    .filter((command) => command.scopeMonth === scopeMonth)
    .map((command) => command.command);
}

export function selectDraftEntriesForScope(
  state: DraftCommandState,
  scopeMonth: string | null | undefined
) {
  const entriesByKey = new Map<string, { goalId: string; unitKey: string }>();
  for (const command of selectDraftCommandsForScope(state, scopeMonth)) {
    const entryKey = draftCommandEntryKey(command);
    if (!entriesByKey.has(entryKey)) {
      entriesByKey.set(entryKey, {
        goalId: command.goalId,
        unitKey: command.unitKey,
      });
    }
  }
  return Array.from(entriesByKey.values());
}

export function shouldKeepDraftCommandForPreview({
  command,
  scopeMonth,
  previewEntryKeys,
  commandsByScope,
}: {
  command: PlannerDraftCommand;
  scopeMonth: string;
  previewEntryKeys: Set<string>;
  commandsByScope: Record<string, PlannerDraftCommand[]>;
}) {
  const entryKey = draftCommandEntryKey(command);
  if (previewEntryKeys.has(entryKey)) {
    return true;
  }
  if (command.kind !== "move_item") {
    return false;
  }
  return Object.entries(commandsByScope).some(([month, commands]) => {
    if (month === scopeMonth) {
      return false;
    }
    return commands.some(
      (other) =>
        other.kind === "move_item" && draftCommandEntryKey(other) === entryKey
    );
  });
}

