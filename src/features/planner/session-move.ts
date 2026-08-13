import {
  draftCommandEntryKey,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";

export type SessionMoveDraftAction = {
  type: "upsert_move";
  scopeMonth: string;
  goalId: string;
  unitKey: string;
  scheduledDate: string | null;
};

export function buildSessionMoveCommands({
  goalId,
  unitKey,
  sourceMonth,
  destDate,
}: {
  goalId: string;
  unitKey: string;
  sourceMonth: string;
  destDate: string;
}): SessionMoveDraftAction[] {
  const destMonth = destDate.slice(0, 7);
  if (destMonth !== sourceMonth) {
    return [
      {
        type: "upsert_move",
        scopeMonth: sourceMonth,
        goalId,
        unitKey,
        scheduledDate: null,
      },
      {
        type: "upsert_move",
        scopeMonth: destMonth,
        goalId,
        unitKey,
        scheduledDate: destDate,
      },
    ];
  }
  return [
    {
      type: "upsert_move",
      scopeMonth: sourceMonth,
      goalId,
      unitKey,
      scheduledDate: destDate,
    },
  ];
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
