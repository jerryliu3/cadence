import { isEntryImmovableForDraft } from "@/features/planner/calendar-format";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";
import type { DraftCommandAction } from "@/features/planner/draft-command-reducer";
import { normalizePlannerLocalTime } from "@/lib/planner/schedule-time";

export type DraftTimeOverridePlan =
  | {
      status: "blocked";
      reason: "immovable" | "invalid_time";
    }
  | {
      status: "dispatch";
      actions: DraftCommandAction[];
    };

export function planDraftTimeOverrideUpdate({
  entry,
  localTimeInput,
  baselineOverride,
}: {
  entry: PlannerDayDetailEntry;
  localTimeInput: string;
  baselineOverride: string | null;
}): DraftTimeOverridePlan {
  const itemId = entry.activeItem?.id ?? null;
  if (!itemId || isEntryImmovableForDraft(entry)) {
    return {
      status: "blocked",
      reason: "immovable",
    };
  }

  let normalizedTime: string | null;
  try {
    normalizedTime = normalizePlannerLocalTime(localTimeInput);
  } catch {
    return {
      status: "blocked",
      reason: "invalid_time",
    };
  }

  const removeSetAction: DraftCommandAction = {
    type: "remove_kind",
    itemId,
    kind: "set_item_time_override",
    goalId: entry.originalGoalId,
    unitKey: entry.unitKey,
  };
  const removeClearAction: DraftCommandAction = {
    type: "remove_kind",
    itemId,
    kind: "clear_item_time_override",
    goalId: entry.originalGoalId,
    unitKey: entry.unitKey,
  };

  if (!normalizedTime) {
    if (baselineOverride === null) {
      return {
        status: "dispatch",
        actions: [removeSetAction, removeClearAction],
      };
    }
    return {
      status: "dispatch",
      actions: [
        {
          type: "clear_time_override",
          itemId,
          goalId: entry.originalGoalId,
          unitKey: entry.unitKey,
        },
      ],
    };
  }

  if (normalizedTime === baselineOverride) {
    return {
      status: "dispatch",
      actions: [removeSetAction, removeClearAction],
    };
  }

  return {
    status: "dispatch",
    actions: [
      {
        type: "upsert_time_override",
        itemId,
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        localTime: normalizedTime,
      },
    ],
  };
}
