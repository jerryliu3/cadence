import { useCallback, useMemo, type Dispatch } from "react";
import { toast } from "sonner";
import {
  getEntryDisplayTitle,
  isEntryImmovableForDraft,
} from "@/features/planner/calendar-format";
import type { DraftCommandAction } from "@/features/planner/draft-command-reducer";
import { planDraftTimeOverrideUpdate } from "@/features/planner/draft-time-override";
import type {
  PlannerContextPayload,
  PlannerDayDetailEntry,
  PlannerWorkUnit,
} from "@/features/planner/calendar-surface.types";

export interface QueueDraftMoveCommandInput {
  entry: PlannerDayDetailEntry;
  nextDate: string;
  source: "date_input" | "drag_drop";
}

interface UsePlannerDraftEntryActionsOptions {
  context: PlannerContextPayload | null;
  entriesByDate: Map<string, PlannerDayDetailEntry[]>;
  previewUnitByEntryKey: Map<string, PlannerWorkUnit>;
  completionFactUnitsByGoalDate: Map<string, PlannerWorkUnit[]>;
  dispatchDraftCommand: Dispatch<DraftCommandAction>;
  scheduleDraftMovePreviewRefresh: () => void;
  isValidIsoDate: (value: string) => boolean;
}

export function usePlannerDraftEntryActions({
  context,
  entriesByDate,
  previewUnitByEntryKey,
  completionFactUnitsByGoalDate,
  dispatchDraftCommand,
  scheduleDraftMovePreviewRefresh,
  isValidIsoDate,
}: UsePlannerDraftEntryActionsOptions) {
  const scopeMonth = context?.scopeMonth ?? null;
  const goalTitles = context?.goalTitles ?? null;

  const moveConflictByGoalDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [day, entries] of entriesByDate.entries()) {
      for (const entry of entries) {
        if (entry.draftGhost) {
          continue;
        }
        const key = `${entry.originalGoalId}:${day}`;
        const existing = map.get(key) ?? new Set<string>();
        existing.add(entry.key);
        map.set(key, existing);
      }
    }
    return map;
  }, [entriesByDate]);

  const queueDraftMoveCommand = useCallback(
    ({ entry, nextDate, source }: QueueDraftMoveCommandInput) => {
      if (entry.draftGhost) {
        toast.error("Original-date preview markers cannot be moved directly.");
        return false;
      }
      const normalized = nextDate.trim();
      if (!isValidIsoDate(normalized)) {
        toast.error("Pick a valid move date.");
        return false;
      }
      if (!scopeMonth) {
        return false;
      }
      if (isEntryImmovableForDraft(entry)) {
        toast.error(
          "Completed or historical sessions cannot move in preview mode. Clear completion in the saved plan first."
        );
        return false;
      }
      const baselineUnit = previewUnitByEntryKey.get(entry.key);
      if (!baselineUnit) {
        toast.error("This session is unavailable in the current preview.");
        return false;
      }
      const moveWindow = baselineUnit.draftMoveWindow ?? baselineUnit.placementWindow;
      if (!moveWindow) {
        toast.error("This session does not have a movable placement window.");
        return false;
      }
      if (normalized < moveWindow.start || normalized > moveWindow.end) {
        const creditWindowEnd = baselineUnit.creditWindow?.end ?? moveWindow.end;
        if (normalized < moveWindow.start) {
          toast.error(
            `This session can only move on or after ${moveWindow.start}.`
          );
        } else if (normalized > creditWindowEnd) {
          toast.error(
            `That date is after this session's credit window end (${creditWindowEnd}), which usually reflects the goal end date or cadence period boundary.`
          );
        } else {
          toast.error(
            `That date is outside this session's allowed planner window (${moveWindow.start} to ${moveWindow.end}).`
          );
        }
        return false;
      }
      const collisionKey = `${entry.originalGoalId}:${normalized}`;
      const conflictKeys = moveConflictByGoalDate.get(collisionKey);
      if (
        conflictKeys &&
        (conflictKeys.size > 1 || !conflictKeys.has(entry.key))
      ) {
        toast.error("That goal already has a planner session on the selected date.");
        return false;
      }
      const completionFactConflict = (
        completionFactUnitsByGoalDate.get(collisionKey) ?? []
      ).find((unit) => unit.unitKey !== entry.unitKey);
      if (completionFactConflict) {
        if (
          completionFactConflict.scheduledDate &&
          completionFactConflict.scheduledDate !== normalized
        ) {
          toast.error(
            `That goal is already marked done on ${normalized} (credited from the ${completionFactConflict.scheduledDate} session).`
          );
        } else {
          toast.error("That date already has a completion fact for this goal.");
        }
        return false;
      }

      dispatchDraftCommand({
        type: "upsert_move",
        scopeMonth,
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        scheduledDate: normalized,
      });
      scheduleDraftMovePreviewRefresh();
      if (source === "drag_drop") {
        toast.success(
          `Moved ${getEntryDisplayTitle(entry)} in preview mode to ${normalized}.`
        );
      }
      return true;
    },
    [
      completionFactUnitsByGoalDate,
      dispatchDraftCommand,
      isValidIsoDate,
      moveConflictByGoalDate,
      previewUnitByEntryKey,
      scheduleDraftMovePreviewRefresh,
      scopeMonth,
    ]
  );

  const updateDraftLabel = useCallback(
    (entry: PlannerDayDetailEntry, label: string) => {
      if (entry.draftGhost) {
        return;
      }
      if (!scopeMonth) {
        return;
      }
      const baselineTitle =
        entry.activeGoal?.title ?? goalTitles?.[entry.originalGoalId] ?? null;
      if (!label || label === baselineTitle) {
        dispatchDraftCommand({
          type: "remove_kind",
          scopeMonth,
          kind: "rename_item",
          goalId: entry.originalGoalId,
          unitKey: entry.unitKey,
        });
        return;
      }
      dispatchDraftCommand({
        type: "upsert_rename",
        scopeMonth,
        goalId: entry.originalGoalId,
        unitKey: entry.unitKey,
        label,
      });
    },
    [dispatchDraftCommand, goalTitles, scopeMonth]
  );

  const updateDraftScheduledTimeOverride = useCallback(
    (entry: PlannerDayDetailEntry, localTime: string) => {
      if (!scopeMonth) {
        return;
      }
      const baselineOverride =
        previewUnitByEntryKey.get(entry.key)?.scheduledTimeOverride ??
        entry.activeItem?.scheduled_time_override ??
        null;
      const nextPlan = planDraftTimeOverrideUpdate({
        scopeMonth,
        entry,
        localTimeInput: localTime,
        baselineOverride,
      });
      if (nextPlan.status === "blocked") {
        if (nextPlan.reason === "invalid_time") {
          toast.error("Time must be in 24-hour HH:MM format.");
        } else {
          toast.error(
            "Completed or historical sessions cannot change time overrides in preview mode. Clear completion in the saved plan first."
          );
        }
        return;
      }
      for (const action of nextPlan.actions) {
        dispatchDraftCommand(action);
      }
    },
    [dispatchDraftCommand, previewUnitByEntryKey, scopeMonth]
  );

  const updateDraftScheduledDate = useCallback(
    (entry: PlannerDayDetailEntry, date: string) => {
      if (entry.draftGhost) {
        return;
      }
      if (!date.trim()) {
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
    updateDraftScheduledTimeOverride,
    updateDraftScheduledDate,
  };
}
