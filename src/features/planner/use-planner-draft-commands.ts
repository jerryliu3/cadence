"use client";

import { useCallback, useMemo, type Dispatch } from "react";
import { toast } from "sonner";
import {
  draftCommandReducer,
  selectDraftCommands,
  type DraftCommandAction,
  type DraftCommandState,
} from "@/features/planner/draft-command-reducer";
import { planDraftMove } from "@/features/planner/plan-draft-move";
import { planDraftTimeOverrideUpdate } from "@/features/planner/draft-time-override";
import type {
  DraftItemEdit,
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";
import {
  PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE,
  tryBuildPlannerDraftSaveWindow,
} from "@/lib/planner/draft-window";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";

interface UsePlannerDraftCommandsArgs {
  context: PlannerContextPayload | null;
  scopeMonth: string | null;
  currentScopeMonth: string | null;
  draftWindowWorkUnits: PlannerWorkUnit[];
  draftWindowUnitByEntryKey: Map<string, PlannerWorkUnit>;
  effectiveDraftItemEdits: Record<string, DraftItemEdit | undefined>;
  draftSaveCommands: PlannerDraftCommand[];
  draftCommandState: DraftCommandState;
  dispatchDraftCommand: Dispatch<DraftCommandAction>;
}

export function usePlannerDraftCommands({
  context,
  scopeMonth,
  currentScopeMonth,
  draftWindowWorkUnits,
  draftWindowUnitByEntryKey,
  effectiveDraftItemEdits,
  draftSaveCommands,
  draftCommandState,
  dispatchDraftCommand,
}: UsePlannerDraftCommandsArgs) {
  const moveConflictByGoalDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const unit of draftWindowWorkUnits) {
      const entryKey = `${unit.originalGoalId}:${unit.unitKey}`;
      const editedDate = effectiveDraftItemEdits[entryKey]?.scheduledDate;
      const day = editedDate === undefined ? unit.scheduledDate : editedDate;
      if (!day) {
        continue;
      }
      const key = `${unit.originalGoalId}:${day}`;
      const existing = map.get(key) ?? new Set<string>();
      existing.add(entryKey);
      map.set(key, existing);
    }
    return map;
  }, [draftWindowWorkUnits, effectiveDraftItemEdits]);

  const moveCompletionConflictByGoalDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const unit of draftWindowWorkUnits) {
      if (!unit.creditedCompletionDate) {
        continue;
      }
      map.set(
        `${unit.originalGoalId}:${unit.creditedCompletionDate}`,
        unit.unitKey
      );
    }
    return map;
  }, [draftWindowWorkUnits]);

  const queueDraftMoveCommand = useCallback(
    ({
      entry,
      nextDate,
      source,
    }: {
      entry: PlannerDayDetailEntry;
      nextDate: string;
      source: "date_input" | "drag_drop" | "coach";
    }) => {
      if (!scopeMonth) {
        return false;
      }
      const normalizedDate = nextDate.trim();
      const baselineUnit = draftWindowUnitByEntryKey.get(entry.key);
      const completionConflictUnitKey = moveCompletionConflictByGoalDate.get(
        `${entry.originalGoalId}:${normalizedDate}`
      );
      const planned = planDraftMove({
        entry,
        nextDate: normalizedDate,
        scopeMonth,
        source,
        previewUnit: baselineUnit,
        conflictKeys: moveConflictByGoalDate.get(
          `${entry.originalGoalId}:${normalizedDate}`
        ),
        completionFactConflict: completionConflictUnitKey
          ? {
              unitKey: completionConflictUnitKey,
              scheduledDate: null,
            }
          : undefined,
      });
      if (!planned.ok) {
        toast.error(planned.message);
        return false;
      }
      if (!baselineUnit) {
        return false;
      }

      const existingMove = draftSaveCommands.find(
        (command) =>
          command.kind === "move_item" &&
          command.goalId === entry.originalGoalId &&
          command.unitKey === entry.unitKey
      );
      const sourceDate =
        existingMove?.kind === "move_item"
          ? existingMove.sourceDate
          : baselineUnit.scheduledDate ?? entry.draftDiffFromDate ?? planned.scheduledDate;
      const prospectiveState = draftCommandReducer(draftCommandState, {
        type: "upsert_move",
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        scheduledDate: planned.scheduledDate,
        sourceDate,
      });
      if (currentScopeMonth) {
        const prospectiveWindow = tryBuildPlannerDraftSaveWindow({
          currentMonth: currentScopeMonth,
          commands: selectDraftCommands(prospectiveState),
          workUnits: draftWindowWorkUnits,
        });
        if (!prospectiveWindow.ok) {
          toast.error(
            prospectiveWindow.code === "too_wide"
              ? PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
              : "That date cannot fit in the current draft window."
          );
          return false;
        }
      }

      dispatchDraftCommand({
        type: "upsert_move",
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        scheduledDate: planned.scheduledDate,
        sourceDate,
      });
      return true;
    },
    [
      currentScopeMonth,
      draftCommandState,
      draftSaveCommands,
      draftWindowWorkUnits,
      scopeMonth,
      dispatchDraftCommand,
      moveConflictByGoalDate,
      moveCompletionConflictByGoalDate,
      draftWindowUnitByEntryKey,
    ]
  );

  const updateDraftLabel = useCallback(
    (entry: PlannerDayDetailEntry, label: string) => {
      if (entry.draftGhost || !context?.scopeMonth) {
        return;
      }
      const baselineTitle =
        entry.activeGoal?.title ?? context.goalTitles?.[entry.originalGoalId] ?? null;
      if (!label || label === baselineTitle) {
        dispatchDraftCommand({
          type: "remove_kind",
          kind: "rename_item",
          goalId: entry.originalGoalId,
          unitKey: entry.unitKey,
        });
        return;
      }
      dispatchDraftCommand({
        type: "upsert_rename",
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        label,
      });
    },
    [context, dispatchDraftCommand]
  );

  const updateDraftScheduledTimeOverride = useCallback(
    (entry: PlannerDayDetailEntry, localTime: string) => {
      if (!context?.scopeMonth) {
        return;
      }
      const baselineOverride =
        draftWindowUnitByEntryKey.get(entry.key)?.scheduledTimeOverride ??
        entry.activeItem?.scheduled_time_override ??
        null;
      const nextPlan = planDraftTimeOverrideUpdate({
        entry,
        localTimeInput: localTime,
        baselineOverride,
      });
      if (nextPlan.status === "blocked") {
        if (nextPlan.reason === "invalid_time") {
          toast.error("Time must be in 24-hour HH:MM format.");
        } else {
          toast.error(
            "Completed or otherwise non-editable sessions cannot change time overrides in preview mode."
          );
        }
        return;
      }
      for (const action of nextPlan.actions) {
        dispatchDraftCommand(action);
      }
    },
    [context, dispatchDraftCommand, draftWindowUnitByEntryKey]
  );

  const updateDraftScheduledDate = useCallback(
    (entry: PlannerDayDetailEntry, date: string) => {
      if (entry.draftGhost || !date.trim()) {
        return;
      }
      void queueDraftMoveCommand({
        entry,
        nextDate: date,
        source: "date_input",
      });
    },
    [queueDraftMoveCommand]
  );

  return {
    queueDraftMoveCommand,
    updateDraftLabel,
    updateDraftScheduledDate,
    updateDraftScheduledTimeOverride,
  };
}
