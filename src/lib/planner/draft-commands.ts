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
  return [...commands].sort((left, right) => {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
    const byGoal = compareCanonicalStrings(left.goalId, right.goalId);
    if (byGoal !== 0) {
      return byGoal;
    }
    const byKind = commandKindOrder[left.kind] - commandKindOrder[right.kind];
    if (byKind !== 0) {
      return byKind;
    }
    const byUnit = compareCanonicalStrings(
      readCommandUnitKey(left),
      readCommandUnitKey(right)
    );
    if (byUnit !== 0) {
      return byUnit;
    }
    const byPayload = compareCanonicalStrings(
      commandPayloadTiebreak(left),
      commandPayloadTiebreak(right)
    );
    if (byPayload !== 0) {
      return byPayload;
    }
    return compareCanonicalStrings(left.id, right.id);
  });
}

export function projectPlannerDraftCommands(
  commands: PlannerDraftCommand[]
): Record<string, PlannerDraftItemProjection> {
  const projection: Record<string, PlannerDraftItemProjection> = {};
  for (const command of sortPlannerDraftCommands(commands)) {
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
