import type { PlannerContextPayload } from "@/features/planner/calendar-surface.types";
import { getWindowState } from "@/lib/planner/dates";
import { PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE } from "@/lib/planner/draft-window";

export const READ_ONLY_MONTH_HINT =
  "This session belongs to another month snapshot. Open that month to edit it.";

export function getNonPublishablePreviewMessage({
  preview,
  context,
  draftSaveWindow,
}: {
  preview: NonNullable<PlannerContextPayload["preview"]>;
  context: PlannerContextPayload | null;
  draftSaveWindow: { start: string; end: string } | null;
}) {
  if (
    context &&
    draftSaveWindow &&
    getWindowState(draftSaveWindow, context.asOfDate) === "historical"
  ) {
    return "Publishing an elapsed window is not supported. Publish a window that includes today or a future date.";
  }
  if (preview.solver.issueCodes.includes("invalid_lock")) {
    const affectedGoals = preview.solver.invalidGoalIds
      .slice(0, 3)
      .map((goalId) => context?.goalTitles?.[goalId] ?? goalId);
    const affectedLabel =
      affectedGoals.length > 0 ? `Affected goals: ${affectedGoals.join(", ")}. ` : "";
    return `${affectedLabel}Locked sessions currently conflict with this regenerated preview. Unlock affected sessions, regenerate, then save.`;
  }
  if (preview.solver.issueCodes.length > 0) {
    return `Resolve planner issues before saving: ${preview.solver.issueCodes.join(", ")}.`;
  }
  return "This preview is not savable yet. Regenerate and resolve planner issues before saving.";
}

interface PlannerSaveAvailabilityArgs {
  context: PlannerContextPayload | null;
  effectivePreview: PlannerContextPayload["preview"] | null;
  draftSaveWindow: { start: string; end: string } | null;
  draftWindowTooWide: boolean;
  hasDraftSession: boolean;
  plannerReadOnly: boolean;
}

export interface PlannerSaveAvailability {
  blockedSave: string | null;
  draftSaveBlocked: boolean;
  draftSaveBlockedMessage: string | null;
  rebuildBlockedMessage: string | undefined;
  canResetPlan: boolean;
  canRecoverPastSessions: boolean;
  hasUnsavedPlannerChanges: boolean;
  canShowSaveAction: boolean;
}

export function selectPlannerSaveAvailability({
  context,
  effectivePreview,
  draftSaveWindow,
  draftWindowTooWide,
  hasDraftSession,
  plannerReadOnly,
}: PlannerSaveAvailabilityArgs): PlannerSaveAvailability {
  const blockedSave = draftWindowTooWide
    ? PLANNER_DRAFT_WINDOW_TOO_WIDE_MESSAGE
    : context &&
        effectivePreview &&
        (getWindowState(
          draftSaveWindow ?? { start: context.asOfDate, end: context.asOfDate },
          context.asOfDate
        ) === "historical" ||
          !effectivePreview.solver.publishable)
      ? getNonPublishablePreviewMessage({
          preview: effectivePreview,
          context,
          draftSaveWindow,
        })
      : null;

  const hasLockedPlanItems = Boolean(
    context?.activePlan?.items.some((item) => item.locked)
  );
  const canResetPlan = Boolean(!hasDraftSession && hasLockedPlanItems);
  const hasOverduePlannerItems = Boolean(
    context?.staleness.reasons.some((reason) => reason.code === "overdue_item")
  );
  const canRecoverPastSessions = Boolean(
    !plannerReadOnly && context?.activePlan && hasOverduePlannerItems
  );
  const hasUnsavedPlannerChanges = Boolean(hasDraftSession || !context?.activePlan);
  const canShowSaveAction = Boolean(effectivePreview);

  return {
    blockedSave,
    draftSaveBlocked: blockedSave !== null,
    draftSaveBlockedMessage: blockedSave,
    rebuildBlockedMessage: hasDraftSession
      ? "Save or undo preview changes before rebuilding schedule."
      : undefined,
    canResetPlan,
    canRecoverPastSessions,
    hasUnsavedPlannerChanges,
    canShowSaveAction,
  };
}
