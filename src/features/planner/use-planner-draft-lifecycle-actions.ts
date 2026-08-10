import { useCallback, useState, type Dispatch } from "react";
import { toast } from "sonner";
import { resolveNonPublishablePreviewMessage } from "@/features/planner/calendar-format";
import type { DraftCommandAction } from "@/features/planner/draft-command-reducer";
import type {
  PlannerContextPayload,
  PlannerErrorPayload,
} from "@/features/planner/calendar-surface.types";
import {
  getApiErrorMessage,
  isApiClientError,
  postJson,
} from "@/lib/api/client";
import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";
import { buildPlannerConfirmationHash } from "@/lib/planner/publish-payload";
import type { PlannerPolicy } from "@/lib/planner/policy";
import { withPlannerRefreshTimeout } from "@/lib/planner/refresh-timeout";

interface UsePlannerDraftLifecycleActionsOptions {
  context: PlannerContextPayload | null;
  effectivePreview: NonNullable<PlannerContextPayload["preview"]> | null;
  effectiveDraftPolicy: PlannerPolicy | null;
  draftSaveCommands: PlannerDraftCommand[];
  clearDraftScopeSession: (scopeMonth: string) => void;
  dispatchDraftCommand: Dispatch<DraftCommandAction>;
  loadContext: (options?: {
    showLoading?: boolean;
    toastOnError?: boolean;
  }) => Promise<boolean>;
  onPlannerMutation: () => void;
  onPlannerStateReset: () => void;
  onDraftDiscarded: () => void;
}

export function usePlannerDraftLifecycleActions({
  context,
  effectivePreview,
  effectiveDraftPolicy,
  draftSaveCommands,
  clearDraftScopeSession,
  dispatchDraftCommand,
  loadContext,
  onPlannerMutation,
  onPlannerStateReset,
  onDraftDiscarded,
}: UsePlannerDraftLifecycleActionsOptions) {
  const [saveLoading, setSaveLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const savePlan = useCallback(async () => {
    if (!effectivePreview || !context?.capabilities.calendarEnabled) {
      return;
    }
    const expectedDigest = context.revisions.scheduleDigest;
    if (!expectedDigest) {
      toast.error("Planner state is stale. Refresh and regenerate the preview.");
      return;
    }
    const publishBlockedByElapsedMonth =
      context.scopeMonth < context.asOfDate.slice(0, 7);
    if (publishBlockedByElapsedMonth || !effectivePreview.solver.publishable) {
      toast.error(resolveNonPublishablePreviewMessage(context, effectivePreview));
      return;
    }
    const confirmationHash = effectivePreview.solver.confirmationRequired
      ? buildPlannerConfirmationHash({
          previewHash: effectivePreview.generationInputHash,
          issueCodes: effectivePreview.solver.issueCodes,
        })
      : null;

    setSaveLoading(true);
    let payload: PlannerErrorPayload & { replayed?: boolean };
    try {
      try {
        const scopePayload = {
          scopeMonth: context.scopeMonth,
          previewHash: effectivePreview.generationInputHash,
          eligibilityMode: effectivePreview.eligibilityMode,
          confirmationHash,
          policy: effectiveDraftPolicy ?? undefined,
          preserveExistingAssignments: effectivePreview.preserveExistingAssignments,
          draftCommands: draftSaveCommands,
        };
        payload = await postJson<PlannerErrorPayload & { replayed?: boolean }>(
          "/api/planner/save",
          {
            expectedDigest,
            scopes: [scopePayload],
          }
        );
      } catch (error) {
        if (isApiClientError(error) && error.code === "planner_not_publishable") {
          const issueCodes = Array.isArray(error.details?.issueCodes)
            ? error.details.issueCodes.filter(
                (value): value is string => typeof value === "string"
              )
            : [];
          const detailSuffix =
            issueCodes.length > 0 ? ` (${issueCodes.join(", ")})` : "";
          toast.error(
            `${error.message ?? "Planner save is currently blocked."}${detailSuffix}`
          );
          return;
        }
        toast.error(getApiErrorMessage(error, "Planner save failed."));
        return;
      }
      try {
        clearDraftScopeSession(context.scopeMonth);
        dispatchDraftCommand({ type: "clear" });
        onPlannerMutation();
        const refreshed = await withPlannerRefreshTimeout({
          operation: loadContext({
            showLoading: false,
            toastOnError: false,
          }),
          timeoutMessage:
            "Plan saved, but calendar refresh timed out. Please refresh the page.",
        });
        if (!refreshed) {
          toast.error(
            "Plan saved, but calendar refresh failed. Please refresh the page."
          );
          return;
        }
        onPlannerStateReset();
        toast.success(payload.replayed ? "Save replayed." : "Plan saved.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Plan saved, but calendar refresh failed. Please refresh the page."
        );
      }
    } finally {
      setSaveLoading(false);
    }
  }, [
    clearDraftScopeSession,
    context,
    dispatchDraftCommand,
    draftSaveCommands,
    effectiveDraftPolicy,
    effectivePreview,
    loadContext,
    onPlannerMutation,
    onPlannerStateReset,
  ]);

  const resetPlan = useCallback(async () => {
    if (!context?.scopeMonth || !context.capabilities.calendarEnabled) {
      return;
    }
    const expectedDigest = context.revisions.scheduleDigest;
    if (!expectedDigest) {
      toast.error("Planner state is stale. Refresh and try again.");
      return;
    }
    setResetLoading(true);
    try {
      try {
        await postJson("/api/planner/reset", {
          scopeMonth: context.scopeMonth,
          expectedDigest,
        });
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Planner month could not be reset."));
        return;
      }
      try {
        clearDraftScopeSession(context.scopeMonth);
        dispatchDraftCommand({ type: "clear" });
        onPlannerMutation();
        const refreshed = await withPlannerRefreshTimeout({
          operation: loadContext({
            showLoading: false,
            toastOnError: false,
          }),
          timeoutMessage:
            "Plan reset, but calendar refresh timed out. Please refresh the page.",
        });
        if (!refreshed) {
          toast.error(
            "Plan reset, but calendar refresh failed. Please refresh the page."
          );
          return;
        }
        onPlannerStateReset();
        toast.success("Plan reset.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Plan reset, but calendar refresh failed. Please refresh the page."
        );
      }
    } finally {
      setResetLoading(false);
    }
  }, [
    clearDraftScopeSession,
    context,
    dispatchDraftCommand,
    loadContext,
    onPlannerMutation,
    onPlannerStateReset,
  ]);

  const discardDraftChanges = useCallback(() => {
    if (context?.scopeMonth) {
      clearDraftScopeSession(context.scopeMonth);
    }
    onDraftDiscarded();
    toast.success("Preview changes reverted to the saved baseline.");
  }, [clearDraftScopeSession, context, onDraftDiscarded]);

  return {
    saveLoading,
    resetLoading,
    savePlan,
    resetPlan,
    discardDraftChanges,
  };
}
