import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  resolveCompletionControlDisabledReasonForEntry,
  resolveDateFactDispatchForEntry,
  type PlannerEntryDateFactDispatch,
} from "@/features/planner/calendar-completion-selectors";
import { completionDisabledReasonCopy } from "@/features/planner/calendar-format";
import type {
  CompletionControlDisabledReason,
  DraftItemEdit,
  PlannerContextPayload,
  PlannerDayDetailEntry,
} from "@/features/planner/calendar-surface.types";
import type {
  RunCompletionMutationInput,
  RunCompletionMutationResult,
} from "@/features/planner/use-completion-mutation";
import { getApiErrorMessage, postJson } from "@/lib/api/client";
import type { PlannerPolicy } from "@/lib/planner/policy";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";

interface UsePlannerCompletionActionsOptions {
  context: PlannerContextPayload | null;
  dayDetailDay: string | null;
  hasDraftSession: boolean;
  effectiveDraftItemEdits: Record<string, DraftItemEdit>;
  effectiveDraftPolicy: PlannerPolicy | null;
  refreshDraftPreview: (nextPolicy: PlannerPolicy) => Promise<unknown>;
  loadContext: (options?: {
    showLoading?: boolean;
    toastOnError?: boolean;
  }) => Promise<boolean>;
  onPlannerMutation: () => void;
  runCompletionMutation: (
    input: RunCompletionMutationInput
  ) => Promise<RunCompletionMutationResult>;
}

export function usePlannerCompletionActions({
  context,
  dayDetailDay,
  hasDraftSession,
  effectiveDraftItemEdits,
  effectiveDraftPolicy,
  refreshDraftPreview,
  loadContext,
  onPlannerMutation,
  runCompletionMutation,
}: UsePlannerCompletionActionsOptions) {
  const [mutationLoadingKey, setMutationLoadingKey] = useState<string | null>(null);

  const canMutatePlanItems = Boolean(
    context?.capabilities.calendarEnabled &&
      context?.activePlan?.plan.status === "active"
  );
  const calendarEnabled = Boolean(context?.capabilities.calendarEnabled);

  const getDateFactDispatchForEntry = useCallback(
    (
      entry: PlannerDayDetailEntry,
      selectedDate: string | null = dayDetailDay
    ): PlannerEntryDateFactDispatch | null =>
      resolveDateFactDispatchForEntry({
        entry,
        context,
        selectedDate,
      }),
    [context, dayDetailDay]
  );

  const completionControlDisabledReasonForEntry = useCallback(
    (
      entry: PlannerDayDetailEntry,
      dispatch: PlannerEntryDateFactDispatch | null
    ): CompletionControlDisabledReason | null =>
      resolveCompletionControlDisabledReasonForEntry({
        entry,
        dispatch,
        canMutatePlanItems,
        calendarEnabled,
      }),
    [calendarEnabled, canMutatePlanItems]
  );

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
          onPlannerMutation();
          const refreshed = await withPlannerRefreshTimeout({
            operation: loadContext({
              showLoading: false,
              toastOnError: false,
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
          toast.success(nextLocked ? "Planner item locked." : "Planner item unlocked.");
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
    [context, loadContext, onPlannerMutation]
  );

  const toggleDateFact = useCallback(
    async (entry: PlannerDayDetailEntry, selectedDateOverride?: string) => {
      const selectedDate = selectedDateOverride ?? dayDetailDay;
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
      try {
        const result = await runCompletionMutation({
          decision: dispatch.decision,
          desiredFactState,
          goalId: entry.originalGoalId,
          date: selectedDate,
          timezone: context.timezone,
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
        if (hasDraftSession) {
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

        onPlannerMutation();
        const refreshed = await withPlannerRefreshTimeout({
          operation: loadContext({
            showLoading: false,
            toastOnError: false,
          }),
          timeoutMessage:
            "Completion updated, but calendar refresh timed out. Please refresh the page.",
        });
        if (!refreshed) {
          toast.error(
            "Completion updated, but calendar refresh failed. Please refresh the page."
          );
          return;
        }
        toast.success(
          desiredFactState === "present" ? "Marked done." : "Marked not done."
        );
        if (draftDateOverlayActive || draftPreviewRefreshFailed) {
          toast(
            "This entry is still shown with preview overlays. Save or discard preview edits to view canonical placement only."
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Planner completion update failed."
        );
      } finally {
        setMutationLoadingKey(null);
      }
    },
    [
      completionControlDisabledReasonForEntry,
      context,
      dayDetailDay,
      effectiveDraftItemEdits,
      effectiveDraftPolicy,
      getDateFactDispatchForEntry,
      hasDraftSession,
      loadContext,
      onPlannerMutation,
      refreshDraftPreview,
      runCompletionMutation,
    ]
  );

  return {
    mutationLoadingKey,
    canMutatePlanItems,
    getDateFactDispatchForEntry,
    completionControlDisabledReasonForEntry,
    toggleItemLock,
    toggleDateFact,
  };
}
