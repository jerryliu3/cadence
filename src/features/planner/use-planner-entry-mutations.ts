"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { completionDisabledReasonCopy } from "@/features/planner/calendar-format";
import type {
  CompletionControlDisabledReason,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type { DateFactDispatchForEntry } from "@/features/planner/completion-entry-dispatch";
import type { RunCompletionMutationInput } from "@/features/planner/use-completion-mutation";
import { getApiErrorMessage, postJson } from "@/lib/api/client";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";
import type { PlannerPolicy } from "@/lib/planner/policy";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";
import { captureViewportRect } from "@/lib/xp/events";

interface UsePlannerEntryMutationsArgs {
  context: PlannerContextPayload | null;
  hasDraftSession: boolean;
  draftSaveCommands: PlannerDraftCommand[];
  effectiveDraftPolicy: PlannerPolicy | null;
  effectiveDraftItemEdits: Record<string, { scheduledDate?: string | null } | undefined>;
  effectiveSelectedDay: string | null;
  setMutationLoadingKey: (value: string | null) => void;
  getDateFactDispatchForEntry: (
    entry: PlannerDayDetailEntry,
    selectedDate?: string | null
  ) => DateFactDispatchForEntry | null;
  completionControlDisabledReasonForEntry: (
    entry: PlannerDayDetailEntry,
    dispatch: DateFactDispatchForEntry | null
  ) => CompletionControlDisabledReason | null;
  runCompletionMutation: (
    input: RunCompletionMutationInput
  ) => Promise<{ ok: boolean; message: string | null }>;
  handlePlannerMutation: () => void;
  loadContext: (options?: {
    showLoading?: boolean;
    toastOnError?: boolean;
    forcePrepare?: boolean;
  }) => Promise<boolean>;
  refreshDraftPreview: (
    nextPolicy: PlannerPolicy
  ) => Promise<PlannerContextPayload["preview"]>;
}

export function usePlannerEntryMutations({
  context,
  hasDraftSession,
  draftSaveCommands,
  effectiveDraftPolicy,
  effectiveDraftItemEdits,
  effectiveSelectedDay,
  setMutationLoadingKey,
  getDateFactDispatchForEntry,
  completionControlDisabledReasonForEntry,
  runCompletionMutation,
  handlePlannerMutation,
  loadContext,
  refreshDraftPreview,
}: UsePlannerEntryMutationsArgs) {
  const toggleItemLock = useCallback(
    async (entry: PlannerDayDetailEntry) => {
      if (!context || !entry.activeItem) {
        return;
      }
      const expectedDigest = context.revisions.scheduleDigest;
      if (!expectedDigest) {
        toast.error("Planner state is stale. Refresh and try again.");
        return;
      }

      const nextLocked = !entry.activeItem.locked;
      const mutationKey = `lock:${entry.activeItem.id}`;
      setMutationLoadingKey(mutationKey);
      let lockUpdated = false;
      try {
        try {
          await postJson("/api/planner/items/lock", {
            itemId: entry.activeItem.id,
            locked: nextLocked,
            expectedDigest,
          });
          lockUpdated = true;
        } catch (error) {
          toast.error(getApiErrorMessage(error, "Planner lock update failed."));
          return;
        }
        try {
          handlePlannerMutation();
          const refreshed = await withPlannerRefreshTimeout({
            operation: loadContext({
              showLoading: false,
              toastOnError: false,
              forcePrepare: true,
            }),
            timeoutMessage:
              "Lock updated, but calendar refresh timed out. Please refresh the page.",
          });
          if (!refreshed) {
            toast.error(
              "Lock updated, but calendar refresh failed. Please refresh the page."
            );
            return;
          }
        } catch (error) {
          if (lockUpdated) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Lock updated, but calendar refresh failed. Please refresh the page."
            );
            return;
          }
          toast.error(getApiErrorMessage(error, "Planner lock update failed."));
        }
      } finally {
        setMutationLoadingKey(null);
      }
    },
    [context, handlePlannerMutation, loadContext, setMutationLoadingKey]
  );

  const toggleDateFact = useCallback(
    async (
      entry: PlannerDayDetailEntry,
      selectedDateOverride?: string,
      sourceElement?: HTMLElement
    ) => {
      const sourceRect = sourceElement ? captureViewportRect(sourceElement) : undefined;
      const selectedDate = selectedDateOverride ?? effectiveSelectedDay;
      if (!context || !selectedDate) {
        return;
      }
      const dispatch = getDateFactDispatchForEntry(entry, selectedDate);
      const disabledReason = completionControlDisabledReasonForEntry(entry, dispatch);
      if (disabledReason) {
        toast.error(completionDisabledReasonCopy(disabledReason));
        return;
      }
      if (!dispatch) {
        toast.error("This planner item cannot be updated from the current snapshot.");
        return;
      }
      const desiredFactState = dispatch.desiredFactState;
      if (!dispatch.decision.allowed) {
        const message =
          dispatch.decision.reason === "future_creation"
            ? "You can only mark completions for today or a past date."
            : dispatch.decision.reason === "satisfied_elsewhere"
              ? "This completion is already satisfied by another session."
              : "This completion cannot be changed from here.";
        toast.error(message);
        return;
      }
      const requiresPlannerExpectation =
        dispatch.decision.route === "item_date" ||
        dispatch.decision.route === "plan_goal_date";
      const expectedDigest = context.revisions.scheduleDigest;
      if (requiresPlannerExpectation && !expectedDigest) {
        toast.error("Planner state is stale. Refresh and try again.");
        return;
      }
      const mutationKey = `fact:${entry.key}`;
      const draftDateOverlayActive = Boolean(
        hasDraftSession &&
          !entry.draftGhost &&
          (entry.draftDiffKind === "moved_to" ||
            entry.draftDiffKind === "new" ||
            effectiveDraftItemEdits[entry.key]?.scheduledDate !== undefined)
      );

      setMutationLoadingKey(mutationKey);
      let loadingReleased = false;
      const releaseLoading = () => {
        if (loadingReleased) {
          return;
        }
        loadingReleased = true;
        setMutationLoadingKey(null);
      };
      try {
        const result = await runCompletionMutation({
          decision: dispatch.decision,
          desiredFactState,
          goalId: entry.originalGoalId,
          date: selectedDate,
          timezone: context.timezone,
          sourceRect,
          plannerItemExpectation:
            requiresPlannerExpectation && entry.activeItem && expectedDigest
              ? {
                  itemId: entry.activeItem.id,
                  expectedDigest,
                }
              : undefined,
          plannerGoalExpectation:
            requiresPlannerExpectation && entry.activeGoal && expectedDigest
              ? {
                  expectedDigest,
                }
              : undefined,
          fallbackErrorMessage: "Planner completion update failed.",
        });

        if (!result.ok) {
          toast.error(result.message ?? "Planner completion update failed.");
          return;
        }

        let draftPreviewRefreshFailed = false;
        if (hasDraftSession && draftSaveCommands.length === 0) {
          const draftPolicyForRefresh =
            effectiveDraftPolicy ?? context.preferences?.defaultPolicy ?? null;
          if (draftPolicyForRefresh) {
            try {
              await refreshDraftPreview(draftPolicyForRefresh);
            } catch {
              draftPreviewRefreshFailed = true;
              toast(
                "Completion saved, but your preview overlay could not refresh automatically. Regenerate preview to sync."
              );
            }
          }
        }

        handlePlannerMutation();
        releaseLoading();
        void withPlannerRefreshTimeout({
          operation: loadContext({
            showLoading: false,
            toastOnError: false,
          }),
          timeoutMessage:
            "Completion updated, but calendar refresh timed out. Please refresh the page.",
        })
          .then((refreshed) => {
            if (!refreshed) {
              toast.error(
                "Completion updated, but calendar refresh failed. Please refresh the page."
              );
              return;
            }
            if (draftDateOverlayActive || draftPreviewRefreshFailed) {
              toast(
                "This entry is still shown with preview overlays. Save or discard preview edits to view canonical placement only."
              );
            }
          })
          .catch((error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Completion updated, but calendar refresh failed. Please refresh the page."
            );
          });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Planner completion update failed."
        );
      } finally {
        releaseLoading();
      }
    },
    [
      completionControlDisabledReasonForEntry,
      context,
      draftSaveCommands.length,
      effectiveDraftItemEdits,
      effectiveDraftPolicy,
      effectiveSelectedDay,
      getDateFactDispatchForEntry,
      handlePlannerMutation,
      hasDraftSession,
      loadContext,
      refreshDraftPreview,
      runCompletionMutation,
      setMutationLoadingKey,
    ]
  );

  return {
    toggleItemLock,
    toggleDateFact,
  };
}
