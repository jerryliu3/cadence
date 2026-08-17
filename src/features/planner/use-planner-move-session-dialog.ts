"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { PlannerDayDetailEntry } from "@/features/planner/calendar-surface.types";
import type { MoveSourceCandidate } from "@/features/planner/planner-move-source-options";

interface UsePlannerMoveSessionDialogArgs {
  moveDialogDay: string | null;
  effectiveMoveDialogSourceEntryKey: string;
  moveDialogSourceOptions: MoveSourceCandidate[];
  queueDraftMoveCommand: (args: {
    entry: PlannerDayDetailEntry;
    nextDate: string;
    source: "date_input" | "drag_drop" | "coach";
  }) => boolean;
  isValidIsoDate: (value: string) => boolean;
  closeMoveDialog: () => void;
}

export function usePlannerMoveSessionDialog({
  moveDialogDay,
  effectiveMoveDialogSourceEntryKey,
  moveDialogSourceOptions,
  queueDraftMoveCommand,
  isValidIsoDate,
  closeMoveDialog,
}: UsePlannerMoveSessionDialogArgs) {
  const submitMoveDialog = useCallback(() => {
    if (!moveDialogDay || !isValidIsoDate(moveDialogDay)) {
      toast.error("Select a valid destination date.");
      return;
    }
    if (!effectiveMoveDialogSourceEntryKey) {
      toast.error("Select a scheduled date to move from.");
      return;
    }
    const sourceOption = moveDialogSourceOptions.find(
      (option) => option.entryKey === effectiveMoveDialogSourceEntryKey
    );
    if (!sourceOption) {
      toast.error("Selected source session is no longer available.");
      return;
    }
    const moved = queueDraftMoveCommand({
      entry: sourceOption.entry,
      nextDate: moveDialogDay,
      source: "date_input",
    });
    if (!moved) {
      return;
    }
    closeMoveDialog();
    toast.success("Move staged. Save plan to persist.");
  }, [
    closeMoveDialog,
    effectiveMoveDialogSourceEntryKey,
    isValidIsoDate,
    moveDialogDay,
    moveDialogSourceOptions,
    queueDraftMoveCommand,
  ]);

  return {
    submitMoveDialog,
  };
}
