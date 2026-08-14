import { z } from "zod";
import {
  canonicalHash,
  compareCanonicalStrings,
} from "@/lib/planner/canonical";
import { plannerLocalTimeSchema } from "@/lib/planner/schedule-time";

const draftCommandBaseSchema = z
  .object({
    id: z.uuid(),
    sequence: z.number().int().nonnegative(),
    goalId: z.uuid(),
  })
  .strict();

const itemDraftCommandBaseSchema = draftCommandBaseSchema
  .extend({
    unitKey: z.string().trim().min(1).max(200),
  })
  .strict();

const moveItemCommandSchema = itemDraftCommandBaseSchema
  .extend({
    kind: z.literal("move_item"),
    scheduledDate: z.iso.date().nullable(),
    sourceDate: z.iso.date(),
  })
  .strict();

const renameItemCommandSchema = itemDraftCommandBaseSchema
  .extend({
    kind: z.literal("rename_item"),
    label: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

const setItemTimeOverrideCommandSchema = itemDraftCommandBaseSchema
  .extend({
    kind: z.literal("set_item_time_override"),
    localTime: plannerLocalTimeSchema,
  })
  .strict();

const clearItemTimeOverrideCommandSchema = itemDraftCommandBaseSchema
  .extend({
    kind: z.literal("clear_item_time_override"),
  })
  .strict();

export const plannerDraftCommandSchema = z.discriminatedUnion("kind", [
  moveItemCommandSchema,
  renameItemCommandSchema,
  setItemTimeOverrideCommandSchema,
  clearItemTimeOverrideCommandSchema,
]);

export type PlannerDraftCommand = z.infer<typeof plannerDraftCommandSchema>;

export interface PlannerDraftItemProjection {
  scheduledDate?: string | null;
  label?: string | null;
  scheduledTimeOverride?: string | null;
}

const commandKindOrder: Record<PlannerDraftCommand["kind"], number> = {
  move_item: 0,
  set_item_time_override: 1,
  clear_item_time_override: 2,
  rename_item: 3,
};

function readCommandUnitKey(command: PlannerDraftCommand) {
  return "unitKey" in command ? command.unitKey : "";
}

function commandPayloadTiebreak(command: PlannerDraftCommand) {
  switch (command.kind) {
    case "move_item":
      return canonicalHash({
        kind: command.kind,
        goalId: command.goalId,
        unitKey: command.unitKey,
        scheduledDate: command.scheduledDate,
        sourceDate: command.sourceDate,
      });
    case "rename_item":
      return canonicalHash({
        kind: command.kind,
        goalId: command.goalId,
        unitKey: command.unitKey,
        label: command.label,
      });
    case "set_item_time_override":
      return canonicalHash({
        kind: command.kind,
        goalId: command.goalId,
        unitKey: command.unitKey,
        localTime: command.localTime,
      });
    case "clear_item_time_override":
      return canonicalHash({
        kind: command.kind,
        goalId: command.goalId,
        unitKey: command.unitKey,
      });
    default:
      return "";
  }
}

export function draftCommandEntryKey(command: {
  goalId: string;
  unitKey: string;
}) {
  return `${command.goalId}:${command.unitKey}`;
}

export function sortPlannerDraftCommands(commands: PlannerDraftCommand[]) {
  const prepared = commands.map((command) => ({
    command,
    unitKey: readCommandUnitKey(command),
    payloadHash: commandPayloadTiebreak(command),
  }));
  prepared.sort((left, right) => {
    if (left.command.sequence !== right.command.sequence) {
      return left.command.sequence - right.command.sequence;
    }
    const byGoal = compareCanonicalStrings(
      left.command.goalId,
      right.command.goalId
    );
    if (byGoal !== 0) {
      return byGoal;
    }
    const byKind =
      commandKindOrder[left.command.kind] - commandKindOrder[right.command.kind];
    if (byKind !== 0) {
      return byKind;
    }
    const byUnit = compareCanonicalStrings(left.unitKey, right.unitKey);
    if (byUnit !== 0) {
      return byUnit;
    }
    const byPayload = compareCanonicalStrings(left.payloadHash, right.payloadHash);
    if (byPayload !== 0) {
      return byPayload;
    }
    return compareCanonicalStrings(left.command.id, right.command.id);
  });
  return prepared.map((entry) => entry.command);
}

export function projectPlannerDraftCommands(
  commands: PlannerDraftCommand[],
  options: { sorted?: boolean } = {}
): Record<string, PlannerDraftItemProjection> {
  const projection: Record<string, PlannerDraftItemProjection> = {};
  const orderedCommands = options.sorted
    ? commands
    : sortPlannerDraftCommands(commands);
  for (const command of orderedCommands) {
    const key = draftCommandEntryKey(command);
    const next = projection[key] ?? {};
    if (command.kind === "move_item") {
      next.scheduledDate = command.scheduledDate;
    } else if (command.kind === "rename_item") {
      next.label = command.label;
    } else if (command.kind === "set_item_time_override") {
      next.scheduledTimeOverride = command.localTime;
    } else {
      next.scheduledTimeOverride = null;
    }
    projection[key] = next;
  }
  return projection;
}

export function buildDraftPinnedDatesFromCommands(
  commands: PlannerDraftCommand[]
): Record<string, string> {
  const projected = projectPlannerDraftCommands(commands);
  const pinnedDates: Record<string, string> = {};
  for (const [entryKey, edit] of Object.entries(projected)) {
    if (typeof edit.scheduledDate === "string") {
      pinnedDates[entryKey] = edit.scheduledDate;
    }
  }
  return pinnedDates;
}
