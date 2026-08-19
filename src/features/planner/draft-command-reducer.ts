import { createClientUuid } from "@/features/planner/calendar-format";
import { type PlannerDraftCommand } from "@/lib/planner/draft-commands";

export interface DraftCommandState {
  commands: PlannerDraftCommand[];
  nextSequence: number;
}

export type DraftCommandAction =
  | {
      type: "upsert_move";
      itemId: string;
      goalId: string;
      unitKey: string;
      scheduledDate: string | null;
      sourceDate: string;
    }
  | {
      type: "upsert_rename";
      itemId: string;
      goalId: string;
      unitKey: string;
      label: string | null;
    }
  | {
      type: "upsert_time_override";
      itemId: string;
      goalId: string;
      unitKey: string;
      localTime: string;
    }
  | {
      type: "clear_time_override";
      itemId: string;
      goalId: string;
      unitKey: string;
    }
  | {
      type: "remove_kind";
      kind:
        | "move_item"
        | "rename_item"
        | "set_item_time_override"
        | "clear_item_time_override";
      itemId: string;
      goalId: string;
      unitKey: string;
    }
  | {
      type: "remove_entries";
      entries: Array<{ itemId: string; goalId: string; unitKey: string }>;
    }
  | { type: "clear" };

export const initialDraftCommandState: DraftCommandState = {
  commands: [],
  nextSequence: 0,
};

function commandTargetsEntry(
  command: PlannerDraftCommand,
  itemId: string
) {
  return command.itemId === itemId;
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
            command.kind === action.kind &&
            commandTargetsEntry(command, action.itemId)
          )
      ),
    };
  }
  if (action.type === "remove_entries") {
    const keys = new Set(action.entries.map((entry) => entry.itemId));
    if (keys.size === 0) {
      return state;
    }
    return {
      ...state,
      commands: state.commands.filter(
        (command) => !keys.has(command.itemId)
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
      command.kind === actionKind &&
      commandTargetsEntry(command, action.itemId)
  );

  if (existingIndex >= 0) {
    const existingCommand = state.commands[existingIndex];
    const identity = {
      id: existingCommand.id,
      sequence: existingCommand.sequence,
      itemId: existingCommand.itemId,
      goalId: action.goalId,
      unitKey: action.unitKey,
    };
    const nextCommand: PlannerDraftCommand =
      action.type === "upsert_move"
        ? {
            ...identity,
            kind: "move_item",
            scheduledDate: action.scheduledDate,
            sourceDate:
              existingCommand.kind === "move_item"
                ? existingCommand.sourceDate
                : action.sourceDate,
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
    nextCommands[existingIndex] = nextCommand;
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
          itemId: action.itemId,
          goalId: action.goalId,
          unitKey: action.unitKey,
          scheduledDate: action.scheduledDate,
          sourceDate: action.sourceDate,
        }
      : action.type === "upsert_rename"
        ? {
            id: createClientUuid(),
            sequence: nextSequence,
            kind: "rename_item",
            itemId: action.itemId,
            goalId: action.goalId,
            unitKey: action.unitKey,
            label: action.label,
          }
        : action.type === "upsert_time_override"
          ? {
              id: createClientUuid(),
              sequence: nextSequence,
              kind: "set_item_time_override",
              itemId: action.itemId,
              goalId: action.goalId,
              unitKey: action.unitKey,
              localTime: action.localTime,
            }
          : {
              id: createClientUuid(),
              sequence: nextSequence,
              kind: "clear_item_time_override",
              itemId: action.itemId,
              goalId: action.goalId,
              unitKey: action.unitKey,
            };

  return {
    commands: [...state.commands, nextCommand],
    nextSequence,
  };
}

export function selectDraftCommands(state: DraftCommandState) {
  return state.commands;
}

export function selectDraftEntries(state: DraftCommandState) {
  const entriesByKey = new Map<
    string,
    { itemId: string; goalId: string; unitKey: string }
  >();
  for (const command of state.commands) {
    const entryKey = command.itemId;
    if (!entriesByKey.has(entryKey)) {
      entriesByKey.set(entryKey, {
        itemId: command.itemId,
        goalId: command.goalId,
        unitKey: command.unitKey,
      });
    }
  }
  return Array.from(entriesByKey.values());
}
