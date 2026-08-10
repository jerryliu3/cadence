"use client";

import { useCallback, useEffect, useMemo, useRef, type Dispatch } from "react";
import { toast } from "sonner";
import {
  draftCommandReducer,
  selectDraftCommandsForScope,
  type DraftCommandAction,
  type DraftCommandState,
} from "@/features/planner/draft-command-reducer";
import type {
  PlannerContextPayload,
  PlannerPreviewResponsePayload,
} from "@/features/planner/calendar-surface.types";
import { getApiErrorMessage, postJson } from "@/lib/api/client";
import {
  draftCommandEntryKey,
  sortPlannerDraftCommands,
  type PlannerDraftCommand,
} from "@/lib/planner/draft-commands";
import type { PlannerPolicy } from "@/lib/planner/policy";

interface UsePlannerDraftPreviewSessionOptions {
  context: PlannerContextPayload | null;
  effectivePreview: NonNullable<PlannerContextPayload["preview"]> | null;
  effectiveDraftPolicy: PlannerPolicy | null;
  effectiveDraftCommands: PlannerDraftCommand[];
  draftCommandState: DraftCommandState;
  dispatchDraftCommand: Dispatch<DraftCommandAction>;
  setDraftPreviewForScope: (
    scopeMonth: string,
    preview: NonNullable<PlannerContextPayload["preview"]> | null
  ) => void;
  draftMovePreviewRefreshDelayMs: number;
}

export function usePlannerDraftPreviewSession({
  context,
  effectivePreview,
  effectiveDraftPolicy,
  effectiveDraftCommands,
  draftCommandState,
  dispatchDraftCommand,
  setDraftPreviewForScope,
  draftMovePreviewRefreshDelayMs,
}: UsePlannerDraftPreviewSessionOptions) {
  const draftMoveRefreshTimerRef = useRef<number | null>(null);
  const draftSaveCommands = useMemo(
    () => effectiveDraftCommands,
    [effectiveDraftCommands]
  );

  const requestPreview = useCallback(
    async (
      nextPolicy: PlannerPolicy,
      solveIntent: "stable" | "replan",
      draftCommands: PlannerDraftCommand[]
    ) => {
      if (!context?.scopeMonth || !context.timezone) {
        throw new Error("Planner context is unavailable.");
      }
      try {
        const previewPayload = await postJson<PlannerPreviewResponsePayload>(
          "/api/planner/context",
          {
            scopeMonth: context.scopeMonth,
            timezone: context.timezone,
            policy: nextPolicy,
            source: context.activePlan ? "update" : "manual",
            solveIntent,
            draftCommands,
          }
        );
        return previewPayload.preview;
      } catch (error) {
        throw new Error(getApiErrorMessage(error, "Preview refresh failed."));
      }
    },
    [context]
  );

  /**
   * The only way a preview becomes the draft. `replan` results deliberately do
   * not come through here: they are proposals, and the save route always solves
   * `stable`, so storing one would hand the user a draft that cannot publish.
   */
  const draftSaveCommandsRef = useRef(draftSaveCommands);
  useEffect(() => {
    draftSaveCommandsRef.current = draftSaveCommands;
  }, [draftSaveCommands]);
  useEffect(
    () => () => {
      if (draftMoveRefreshTimerRef.current !== null) {
        window.clearTimeout(draftMoveRefreshTimerRef.current);
      }
    },
    []
  );

  const refreshDraftPreview = useCallback(
    async (nextPolicy: PlannerPolicy) => {
      const preview = await requestPreview(
        nextPolicy,
        "stable",
        draftSaveCommandsRef.current
      );
      if (context?.scopeMonth) {
        setDraftPreviewForScope(context.scopeMonth, preview);
      }
      return preview;
    },
    [context, requestPreview, setDraftPreviewForScope]
  );

  /**
   * Draft pins are part of `generationInputHash`, so the preview on screen goes
   * stale the moment a move is dispatched and save would reject it. Re-solve to
   * refresh the hash, and to surface a move the solver cannot honor (outside the
   * placement window, colliding with a lock) while the user is still looking at
   * the calendar rather than at publish time.
   */
  const draftMoveRefreshRunnerRef = useRef<() => void>(() => {});
  useEffect(() => {
    draftMoveRefreshRunnerRef.current = () => {
      const refreshPolicy =
        effectiveDraftPolicy ?? context?.preferences?.defaultPolicy ?? null;
      if (!context?.scopeMonth || !refreshPolicy) {
        return;
      }
      void refreshDraftPreview(refreshPolicy).catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Preview could not be regenerated for that move."
        );
      });
    };
  }, [context, effectiveDraftPolicy, refreshDraftPreview]);

  /**
   * Ask the solver where things would go under `nextPolicy` when policy cost
   * outranks stability, then record the differences as `move_item` commands.
   *
   * The proposal is scratch: it is never stored as the draft. Only the pins it
   * produces persist, which is what makes a coach change survive the next
   * recompute instead of evaporating on the following stable solve.
   *
   * Existing pins are kept, not released, so a policy change reshuffles what
   * the user has not placed by hand and leaves deliberate placements alone.
   */
  const applyPolicyReplanMoves = useCallback(
    async (nextPolicy: PlannerPolicy) => {
      if (!context?.scopeMonth || !effectivePreview) {
        return { moveCount: 0, movedEntryKeys: [] as string[] };
      }
      const scopeMonth = context.scopeMonth;
      const priorCommands = draftSaveCommandsRef.current;
      const proposal = await requestPreview(nextPolicy, "replan", priorCommands);
      if (!proposal) {
        return { moveCount: 0, movedEntryKeys: [] as string[] };
      }
      const baselineDateByEntryKey = new Map(
        effectivePreview.workUnits.map((unit) => [
          draftCommandEntryKey({
            goalId: unit.originalGoalId,
            unitKey: unit.unitKey,
          }),
          unit.scheduledDate,
        ])
      );

      let nextState = draftCommandState;
      const movedEntryKeys: string[] = [];
      for (const unit of proposal.workUnits) {
        const entryKey = draftCommandEntryKey({
          goalId: unit.originalGoalId,
          unitKey: unit.unitKey,
        });
        const nextDate = unit.scheduledDate;
        if (nextDate === null || baselineDateByEntryKey.get(entryKey) === nextDate) {
          continue;
        }
        const action = {
          type: "upsert_move",
          scopeMonth,
          goalId: unit.originalGoalId,
          unitKey: unit.unitKey,
          scheduledDate: nextDate,
        } as const;
        dispatchDraftCommand(action);
        nextState = draftCommandReducer(nextState, action);
        movedEntryKeys.push(entryKey);
      }

      // Keep the ref ahead of the reducer so the stable refresh that follows
      // sends the pins we just created rather than the previous render's list.
      draftSaveCommandsRef.current = sortPlannerDraftCommands(
        selectDraftCommandsForScope(nextState, scopeMonth)
      );
      return { moveCount: movedEntryKeys.length, movedEntryKeys };
    },
    [context, draftCommandState, dispatchDraftCommand, effectivePreview, requestPreview]
  );

  const clearDraftMoveCommands = useCallback(
    (entryKeys: string[]) => {
      if (!context?.scopeMonth || entryKeys.length === 0) {
        return;
      }
      const scopeMonth = context.scopeMonth;
      let nextState = draftCommandState;
      for (const entryKey of entryKeys) {
        const separatorIndex = entryKey.indexOf(":");
        const action = {
          type: "remove_kind",
          scopeMonth,
          kind: "move_item",
          goalId: entryKey.slice(0, separatorIndex),
          unitKey: entryKey.slice(separatorIndex + 1),
        } as const;
        dispatchDraftCommand(action);
        nextState = draftCommandReducer(nextState, action);
      }
      draftSaveCommandsRef.current = sortPlannerDraftCommands(
        selectDraftCommandsForScope(nextState, scopeMonth)
      );
    },
    [context, draftCommandState, dispatchDraftCommand]
  );

  const scheduleDraftMovePreviewRefresh = useCallback(() => {
    if (draftMoveRefreshTimerRef.current !== null) {
      window.clearTimeout(draftMoveRefreshTimerRef.current);
    }
    draftMoveRefreshTimerRef.current = window.setTimeout(() => {
      draftMoveRefreshTimerRef.current = null;
      draftMoveRefreshRunnerRef.current();
    }, draftMovePreviewRefreshDelayMs);
  }, [draftMovePreviewRefreshDelayMs]);

  return {
    draftSaveCommands,
    refreshDraftPreview,
    applyPolicyReplanMoves,
    clearDraftMoveCommands,
    scheduleDraftMovePreviewRefresh,
  };
}
