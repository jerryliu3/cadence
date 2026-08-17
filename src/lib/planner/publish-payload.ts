import type { PlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";
import {
  projectPlannerDraftCommands,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";

export { buildPlannerConfirmationHash } from "@cadence/shared/planner/confirmation";

export interface PlannerDraftItemEdit {
  goalId: string;
  unitKey: string;
  scheduledDate: string | null;
  label: string | null;
  scheduledTimeOverride?: string | null;
}

export class PlannerDraftEditValidationError extends Error {
  constructor(
    readonly code:
      | "draft_item_duplicate"
      | "draft_item_unknown"
      | "draft_item_unmovable"
      | "draft_item_move_unsupported",
    message: string,
    readonly details: Record<string, unknown>
  ) {
    super(message);
    this.name = "PlannerDraftEditValidationError";
  }
}

export interface PlannerPublishPersistencePayload {
  changeSummary: Record<string, number | boolean>;
  items: Array<{
    goal_id: string;
    unit_key: string;
    original_scheduled_date: string | null;
    scheduled_date: string | null;
    scheduled_time_override: string | null;
    effective_scheduled_local_time: string | null;
    effective_scheduled_at_local: string | null;
    locked: boolean;
  }>;
};

function countByKind(diff: PlannerKernelOutput["diff"], kind: PlannerKernelOutput["diff"][number]["kind"]) {
  return diff.filter((entry) => entry.kind === kind).length;
}

function buildDraftEditKey(goalId: string, unitKey: string) {
  return `${goalId}:${unitKey}`;
}

function buildDraftItemEditsFromCommands(commands: PlannerDraftCommand[]) {
  const sortedCommands = sortPlannerDraftCommands(commands);
  const projectedItems = projectPlannerDraftCommands(sortedCommands, {
    sorted: true,
  });
  const draftItemEdits = Object.entries(projectedItems)
    .map(([entryKey, edit]) => {
      const separatorIndex = entryKey.indexOf(":");
      if (separatorIndex <= 0 || separatorIndex === entryKey.length - 1) {
        return null;
      }
      return {
        goalId: entryKey.slice(0, separatorIndex),
        unitKey: entryKey.slice(separatorIndex + 1),
        scheduledDate:
          edit.scheduledDate === undefined ? null : edit.scheduledDate,
        label: edit.label === undefined ? null : edit.label,
        scheduledTimeOverride: edit.scheduledTimeOverride,
      } as PlannerDraftItemEdit;
    })
    .filter((edit): edit is PlannerDraftItemEdit => edit !== null);
  return { draftItemEdits };
}

function isDraftItemImmovable(unit: PlannerKernelOutput["workUnits"][number]) {
  return (
    unit.creditState !== "uncredited" ||
    unit.classification === "satisfied_elsewhere"
  );
}

function applyValidatedDraftItemEdits({
  kernelWorkUnits,
  goalDefaultLocalTimeByGoalId,
  draftItemEdits,
}: {
  kernelWorkUnits: PlannerKernelOutput["workUnits"];
  goalDefaultLocalTimeByGoalId: Map<string, string | null>;
  draftItemEdits: PlannerDraftItemEdit[];
}) {
  const workUnits = kernelWorkUnits.map((unit) => ({ ...unit }));
  const priorEffectiveTimeByKey = new Map(
    workUnits.map((unit) => [
      buildDraftEditKey(unit.originalGoalId, unit.unitKey),
      unit.effectiveScheduledLocalTime ?? null,
    ])
  );
  const unitByKey = new Map(
    workUnits.map((unit) => [buildDraftEditKey(unit.originalGoalId, unit.unitKey), unit])
  );
  const seenDraftEditKeys = new Set<string>();

  for (const edit of draftItemEdits) {
    const key = buildDraftEditKey(edit.goalId, edit.unitKey);
    if (seenDraftEditKeys.has(key)) {
      throw new PlannerDraftEditValidationError(
        "draft_item_duplicate",
        "Draft edits included the same planner item more than once.",
        { goalId: edit.goalId, unitKey: edit.unitKey }
      );
    }
    seenDraftEditKeys.add(key);

    const unit = unitByKey.get(key);
    if (!unit) {
      throw new PlannerDraftEditValidationError(
        "draft_item_unknown",
        "Draft edits referenced an item that is not in the current preview.",
        { goalId: edit.goalId, unitKey: edit.unitKey }
      );
    }

    const nextScheduledDate = edit.scheduledDate;
    const hasScheduledTimeChange =
      edit.scheduledTimeOverride !== undefined &&
      edit.scheduledTimeOverride !== (unit.scheduledTimeOverride ?? null);

    if (hasScheduledTimeChange && isDraftItemImmovable(unit)) {
      throw new PlannerDraftEditValidationError(
        "draft_item_unmovable",
        "Completed planner items cannot be retimed in draft.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          classification: unit.classification,
          creditState: unit.creditState,
        }
      );
    }

    if (nextScheduledDate !== null && nextScheduledDate !== unit.scheduledDate) {
      // Positional intent is resolved by the kernel via `draftPinnedDates`, and
      // preview/save both assert the solver honored it. A move reaching this
      // far means it bypassed that path, so refuse rather than re-apply it here
      // and reintroduce a second scheduling authority.
      throw new PlannerDraftEditValidationError(
        "draft_item_move_unsupported",
        "Positional draft moves must be resolved by the planner kernel before publish.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          scheduledDate: nextScheduledDate,
        }
      );
    }
  }

  let draftRelabeledCount = 0;

  for (const edit of draftItemEdits) {
    const key = buildDraftEditKey(edit.goalId, edit.unitKey);
    const unit = unitByKey.get(key);
    if (!unit) {
      continue;
    }
    if (edit.label !== null && edit.label !== unit.label) {
      unit.label = edit.label;
      draftRelabeledCount += 1;
    }
    if (edit.scheduledTimeOverride !== undefined) {
      unit.scheduledTimeOverride = edit.scheduledTimeOverride;
    }
  }
  for (const unit of workUnits) {
    const goalDefaultLocalTime =
      goalDefaultLocalTimeByGoalId.get(unit.originalGoalId) ??
      unit.goalDefaultLocalTime ??
      null;
    const resolvedTime = resolvePlannerEffectiveScheduledTime({
      scheduledDate: unit.scheduledDate,
      goalDefaultLocalTime,
      scheduledTimeOverride: unit.scheduledTimeOverride ?? null,
    });
    if (
      resolvedTime.goalDefaultLocalTime === null &&
      resolvedTime.scheduledTimeOverride === null &&
      resolvedTime.effectiveScheduledLocalTime === null
    ) {
      delete unit.goalDefaultLocalTime;
      delete unit.scheduledTimeOverride;
      delete unit.effectiveScheduledLocalTime;
      delete unit.effectiveScheduledAtLocal;
      continue;
    }
    if (resolvedTime.goalDefaultLocalTime === null) {
      delete unit.goalDefaultLocalTime;
    } else {
      unit.goalDefaultLocalTime = resolvedTime.goalDefaultLocalTime;
    }
    unit.scheduledTimeOverride = resolvedTime.scheduledTimeOverride;
    unit.effectiveScheduledLocalTime = resolvedTime.effectiveScheduledLocalTime;
    unit.effectiveScheduledAtLocal = resolvedTime.effectiveScheduledAtLocal;
  }

  let draftRetimedCount = 0;
  for (const unit of workUnits) {
    const key = buildDraftEditKey(unit.originalGoalId, unit.unitKey);
    const previous = priorEffectiveTimeByKey.get(key) ?? null;
    const current = unit.effectiveScheduledLocalTime ?? null;
    if (previous !== current) {
      draftRetimedCount += 1;
    }
  }

  return { workUnits, draftRelabeledCount, draftRetimedCount };
}

export function buildPlannerPublishPersistencePayload({
  kernel,
  snapshot,
  draftCommands = [],
}: {
  kernel: PlannerKernelOutput;
  snapshot: PlannerCanonicalSnapshot;
  draftCommands?: PlannerDraftCommand[];
}): PlannerPublishPersistencePayload {
  const goalDefaultLocalTimeByGoalId = new Map(
    snapshot.goals.map((goal) => [goal.id, goal.default_local_time ?? null])
  );

  const { draftItemEdits } = buildDraftItemEditsFromCommands(draftCommands);
  const originalScheduledDateByKey = new Map(
    kernel.workUnits.map((unit) => [
      buildDraftEditKey(unit.originalGoalId, unit.unitKey),
      unit.scheduledDate,
    ])
  );
  const { workUnits, draftRelabeledCount, draftRetimedCount } =
    applyValidatedDraftItemEdits({
      kernelWorkUnits: kernel.workUnits,
      goalDefaultLocalTimeByGoalId,
      draftItemEdits,
    });

  const items = workUnits.map((unit) => {
    const itemKey = buildDraftEditKey(unit.originalGoalId, unit.unitKey);
    return {
      goal_id: unit.originalGoalId,
      unit_key: unit.unitKey,
      original_scheduled_date:
        originalScheduledDateByKey.get(itemKey) ?? unit.scheduledDate,
      scheduled_date: unit.scheduledDate,
      scheduled_time_override: unit.scheduledTimeOverride ?? null,
      effective_scheduled_local_time: unit.effectiveScheduledLocalTime ?? null,
      effective_scheduled_at_local: unit.effectiveScheduledAtLocal ?? null,
      locked: unit.locked,
    };
  });

  const added = countByKind(kernel.diff, "added");
  const removed = countByKind(kernel.diff, "removed");
  const moved = countByKind(kernel.diff, "moved");
  const lockChanged = countByKind(kernel.diff, "lock_changed");
  return {
    changeSummary: {
      added,
      removed,
      moved,
      lockChanged,
      draftCommands: draftCommands.length,
      draftRelabeled: draftRelabeledCount,
      draftRetimed: draftRetimedCount,
      confirmationRequired: kernel.solver.confirmationRequired,
      publishable: kernel.solver.publishable,
    },
    items,
  };
}
