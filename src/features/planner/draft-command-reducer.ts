import { createClientUuid } from "@/features/planner/calendar-format";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";

export interface DraftCommandState {
  commands: PlannerDraftCommand[];
  nextSequence: number;
}

export type DraftCommandAction =
  | {
      type: "upsert_move";
      goalId: string;
      unitKey: string;
      scheduledDate: string | null;
    }
  | {
      type: "upsert_rename";
      goalId: string;
      unitKey: string;
      label: string | null;
    }
  | {
      type: "remove_kind";
      kind:
        | "move_item"
        | "rename_item"
        | "set_item_time_override"
        | "clear_item_time_override";
      goalId: string;
      unitKey: string;
    }
  | { type: "clear" };

export const initialDraftCommandState: DraftCommandState = {
  commands: [],
  nextSequence: 0,
};

function commandTargetsEntry(
  command: PlannerDraftCommand,
  goalId: string,
  unitKey: string
) {
  return (
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
            command.kind === action.kind &&
            commandTargetsEntry(command, action.goalId, action.unitKey)
          )
      ),
    };
  }

  const existingIndex = state.commands.findIndex(
    (command) =>
      command.kind ===
        (action.type === "upsert_move" ? "move_item" : "rename_item") &&
      commandTargetsEntry(command, action.goalId, action.unitKey)
  );

  if (existingIndex >= 0) {
    const existing = state.commands[existingIndex];
    const identity = {
      id: existing.id,
      sequence: existing.sequence,
      goalId: existing.goalId,
      unitKey: action.unitKey,
    };
    const nextCommand: PlannerDraftCommand =
      action.type === "upsert_move"
        ? {
            ...identity,
            kind: "move_item",
            scheduledDate: action.scheduledDate,
          }
        : {
            ...identity,
            kind: "rename_item",
            label: action.label,
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
          goalId: action.goalId,
          unitKey: action.unitKey,
          scheduledDate: action.scheduledDate,
        }
      : {
          id: createClientUuid(),
          sequence: nextSequence,
          kind: "rename_item",
          goalId: action.goalId,
          unitKey: action.unitKey,
          label: action.label,
        };

  return {
    commands: [...state.commands, nextCommand],
    nextSequence,
  };
}

