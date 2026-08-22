"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlannerEligibilityNotices } from "@/features/planner/planner-eligibility-notices";

interface PlannerWarningsPanelProps {
  hasPlannerWarnings: boolean;
  warningsDismissed: boolean;
  showBlockingLoading: boolean;
  error: string | null;
  plannerWarningBannerCopy: string;
  warningsOpen: boolean;
  setWarningsOpen: (open: boolean) => void;
  onDismissBanner: () => void;
  unplaceableGoalSummaries: Array<{
    goalId: string;
    title: string;
    unplacedCount: number;
    reason: "capacity" | "invalid_lock";
  }>;
  invalidLockGoalCount: number;
  capacityWarningGoalCount: number;
  totalUnplacedCount: number;
  warningSuggestedNextSteps: string[];
  eligibilityNotices: PlannerEligibilityNotices;
  plannerReadOnly: boolean;
  canResetPlan: boolean;
  resetLoading: boolean;
  loading: boolean;
  onUnlockAllGoals: () => void;
  onOpenPlannerSettings: () => void;
}

export function PlannerWarningsPanel({
  hasPlannerWarnings,
  warningsDismissed,
  showBlockingLoading,
  error,
  plannerWarningBannerCopy,
  warningsOpen,
  setWarningsOpen,
  onDismissBanner,
  unplaceableGoalSummaries,
  invalidLockGoalCount,
  capacityWarningGoalCount,
  totalUnplacedCount,
  warningSuggestedNextSteps,
  eligibilityNotices,
  plannerReadOnly,
  canResetPlan,
  resetLoading,
  loading,
  onUnlockAllGoals,
  onOpenPlannerSettings,
}: PlannerWarningsPanelProps) {
  return (
    <>
      {hasPlannerWarnings && !warningsDismissed && !showBlockingLoading && !error ? (
        <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-950">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1">{plannerWarningBannerCopy}</p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setWarningsOpen(true)}
              >
                See warnings
              </Button>
              <button
                type="button"
                className="text-xs font-medium underline-offset-2 hover:underline"
                onClick={onDismissBanner}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={warningsOpen} onOpenChange={setWarningsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Planner warnings</DialogTitle>
            <DialogDescription>
              {unplaceableGoalSummaries.length > 0 && invalidLockGoalCount > 0
                ? `${unplaceableGoalSummaries.length} goal${
                    unplaceableGoalSummaries.length === 1 ? "" : "s"
                  } need attention (${invalidLockGoalCount} locked conflict${
                    invalidLockGoalCount === 1 ? "" : "s"
                  }, ${totalUnplacedCount} unresolved session${
                    totalUnplacedCount === 1 ? "" : "s"
                  }).`
                : unplaceableGoalSummaries.length > 0
                  ? `${unplaceableGoalSummaries.length} goal${
                      unplaceableGoalSummaries.length === 1 ? "" : "s"
                    } are not fully scheduled (${totalUnplacedCount} unresolved session${
                      totalUnplacedCount === 1 ? "" : "s"
                    }).`
                  : eligibilityNotices.hardIneligible.length > 0
                    ? `${eligibilityNotices.hardIneligible.length} goal${
                        eligibilityNotices.hardIneligible.length === 1 ? "" : "s"
                      } need updates before they can be fully planned.`
                    : `${eligibilityNotices.linkedTargetCount} linked main goal${
                        eligibilityNotices.linkedTargetCount === 1 ? "" : "s"
                      } ${
                        eligibilityNotices.linkedTargetCount === 1 ? "is" : "are"
                      } hidden this month while linked subgoals are still active.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {unplaceableGoalSummaries.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Not fully scheduled goals
                </p>
                <div
                  className={`space-y-2 ${
                    unplaceableGoalSummaries.length > 5
                      ? "max-h-[17.5rem] overflow-y-auto pr-1"
                      : ""
                  }`}
                >
                  {unplaceableGoalSummaries.map((warning) => (
                    <div key={`warning-${warning.goalId}`} className="rounded-md border p-2">
                      <p className="font-medium">{warning.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {warning.unplacedCount} unresolved session
                        {warning.unplacedCount === 1 ? "" : "s"} (
                        {warning.reason === "invalid_lock"
                          ? "locked conflict"
                          : "capacity shortfall"}
                        )
                      </p>
                    </div>
                  ))}
                </div>
                {warningSuggestedNextSteps.length > 0 ? (
                  <div className="rounded-md border bg-muted/20 p-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Suggested next steps
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {warningSuggestedNextSteps.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            {eligibilityNotices.hardIneligible.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Eligibility blockers
                </p>
                {eligibilityNotices.groupedHardIneligible.map((group) => (
                  <div
                    key={`eligibility-group-${group.reason}`}
                    className={`space-y-1 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground ${
                      group.entries.length > 5
                        ? "max-h-36 overflow-y-auto pr-1"
                        : ""
                    }`}
                  >
                    <p className="font-medium text-foreground">{group.heading}</p>
                    {group.entries.map((item) => (
                      <p key={`eligibility-warning-${item.goalId}`}>
                        {item.goalTitle}: {item.reasonCopy}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {eligibilityNotices.linkedTargetCount > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Linked main goals hidden this month
                </p>
                <div
                  className={`space-y-1 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground ${
                    eligibilityNotices.linkedTargetDetails.length > 5
                      ? "max-h-36 overflow-y-auto pr-1"
                      : ""
                  }`}
                >
                  {eligibilityNotices.linkedTargetDetails.map((detail) => (
                    <p key={`linked-target-warning-${detail.goalId}`}>
                      {detail.goalTitle}: {detail.statusCopy}
                      {detail.sourceGoalTitles.length > 0
                        ? ` Linked subgoals: ${detail.sourceGoalTitles.join(", ")}.`
                        : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {(invalidLockGoalCount > 0 || capacityWarningGoalCount > 0) &&
            !plannerReadOnly ? (
              <div className="flex flex-wrap gap-2">
                {invalidLockGoalCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resetLoading || loading || !canResetPlan}
                    onClick={onUnlockAllGoals}
                  >
                    {resetLoading ? "Unlocking..." : "Unlock all goals"}
                  </Button>
                ) : null}
                {capacityWarningGoalCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenPlannerSettings}
                  >
                    Open planner settings
                  </Button>
                ) : null}
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWarningsOpen(false)}
            >
              Back to calendar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
