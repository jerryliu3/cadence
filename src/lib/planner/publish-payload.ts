import { canonicalHash } from "@/lib/planner/canonical";
import type { PlannerCanonicalSnapshot } from "@/lib/planner/context-loader";
import { getScopeDateRange } from "@/lib/planner/dates";
import type { PlannerKernelOutput } from "@/lib/planner/kernel";
import {
  type PlannerPolicy,
} from "@/lib/planner/policy";
import {
  projectPlannerDraftCommands,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";

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
      | "draft_item_out_of_window"
      | "draft_item_completion_exists"
      | "draft_item_collision",
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
    unit.classification === "historical_miss" ||
    unit.classification === "historical_shortfall" ||
    unit.classification === "satisfied_elsewhere"
  );
}

function applyValidatedDraftItemEdits({
  scopeMonth,
  kernelWorkUnits,
  goalDefaultLocalTimeByGoalId,
  draftItemEdits,
  completions,
}: {
  scopeMonth: string;
  kernelWorkUnits: PlannerKernelOutput["workUnits"];
  goalDefaultLocalTimeByGoalId: Map<string, string | null>;
  draftItemEdits: PlannerDraftItemEdit[];
  completions: PlannerCanonicalSnapshot["completions"];
}) {
  const scopeWindow = getScopeDateRange(scopeMonth);
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
  const nextScheduledByKey = new Map<string, string | null>();
  for (const unit of workUnits) {
    nextScheduledByKey.set(
      buildDraftEditKey(unit.originalGoalId, unit.unitKey),
      unit.scheduledDate
    );
  }

  const completionDatesByGoal = new Map<string, Set<string>>();
  for (const completion of completions) {
    const existing = completionDatesByGoal.get(completion.goal_id) ?? new Set<string>();
    existing.add(completion.completed_on);
    completionDatesByGoal.set(completion.goal_id, existing);
  }

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
        "Completed or historical planner items cannot be retimed in draft.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          classification: unit.classification,
          creditState: unit.creditState,
        }
      );
    }

    if (nextScheduledDate === null || nextScheduledDate === unit.scheduledDate) {
      continue;
    }

    if (isDraftItemImmovable(unit)) {
      throw new PlannerDraftEditValidationError(
        "draft_item_unmovable",
        "Completed or historical planner items cannot be moved in draft.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          classification: unit.classification,
          creditState: unit.creditState,
        }
      );
    }

    const moveWindow = unit.draftMoveWindow ?? unit.placementWindow;
    if (
      !moveWindow ||
      nextScheduledDate < moveWindow.start ||
      nextScheduledDate > moveWindow.end
    ) {
      throw new PlannerDraftEditValidationError(
        "draft_item_out_of_window",
        "Draft move date is outside the allowed planner window.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          scheduledDate: nextScheduledDate,
          placementWindow: unit.placementWindow,
          draftMoveWindow: unit.draftMoveWindow,
          moveWindow,
          scopeWindow,
        }
      );
    }

    if (completionDatesByGoal.get(edit.goalId)?.has(nextScheduledDate)) {
      throw new PlannerDraftEditValidationError(
        "draft_item_completion_exists",
        "Draft move date already has a completion fact for this goal.",
        {
          goalId: edit.goalId,
          unitKey: edit.unitKey,
          scheduledDate: nextScheduledDate,
        }
      );
    }

    nextScheduledByKey.set(key, nextScheduledDate);
  }

  const scheduledDateOwnerByGoal = new Map<string, string>();
  for (const unit of workUnits) {
    const key = buildDraftEditKey(unit.originalGoalId, unit.unitKey);
    const finalDate = nextScheduledByKey.get(key) ?? null;
    if (!finalDate) {
      continue;
    }
    const goalDateKey = buildDraftEditKey(unit.originalGoalId, finalDate);
    const existingOwner = scheduledDateOwnerByGoal.get(goalDateKey);
    if (existingOwner && existingOwner !== key) {
      throw new PlannerDraftEditValidationError(
        "draft_item_collision",
        "Draft move would schedule two units for the same goal on the same date.",
        {
          goalId: unit.originalGoalId,
          scheduledDate: finalDate,
          unitKey: unit.unitKey,
          conflictingUnitKey: existingOwner.slice(existingOwner.indexOf(":") + 1),
        }
      );
    }
    scheduledDateOwnerByGoal.set(goalDateKey, key);
  }

  let draftMovedCount = 0;
  let draftRelabeledCount = 0;

  for (const edit of draftItemEdits) {
    const key = buildDraftEditKey(edit.goalId, edit.unitKey);
    const unit = unitByKey.get(key);
    if (!unit) {
      continue;
    }
    const nextScheduledDate = nextScheduledByKey.get(key) ?? unit.scheduledDate;
    if (nextScheduledDate !== unit.scheduledDate) {
      unit.scheduledDate = nextScheduledDate;
      draftMovedCount += 1;
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

  return { workUnits, draftMovedCount, draftRelabeledCount, draftRetimedCount };
}

export function buildPlannerConfirmationHash({
  previewHash,
  issueCodes,
}: {
  previewHash: string;
  issueCodes: string[];
}) {
  return canonicalHash({
    previewHash,
    issueCodes: [...issueCodes].sort(),
  });
}

export function buildPlannerPublishPersistencePayload({
  scopeMonth,
  policy: _policy,
  kernel,
  snapshot,
  draftCommands = [],
}: {
  scopeMonth: string;
  policy: PlannerPolicy;
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
  const {
    workUnits,
    draftMovedCount,
    draftRelabeledCount,
    draftRetimedCount,
  } = applyValidatedDraftItemEdits({
    scopeMonth,
    kernelWorkUnits: kernel.workUnits,
    goalDefaultLocalTimeByGoalId,
    draftItemEdits,
    completions: snapshot.completions,
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
      draftMoved: draftMovedCount,
      draftRelabeled: draftRelabeledCount,
      draftRetimed: draftRetimedCount,
      confirmationRequired: kernel.solver.confirmationRequired,
      publishable: kernel.solver.publishable,
    },
    items,
  };
}
