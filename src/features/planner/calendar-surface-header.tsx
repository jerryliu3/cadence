"use client";

import { CalendarDays, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface EligibilityNotice {
  goalId: string;
  goalTitle: string;
  reasonCopy: string;
}

interface CalendarSurfaceHeaderProps {
  hasDraftSession: boolean;
  horizonCounter: { thisMonth: number; total: number; remaining: number } | null;
  eligibilityNotices: {
    hardIneligible: EligibilityNotice[];
    scopeOnlyCount: number;
  };
  canResetPlan: boolean;
  resetLoading: boolean;
  loading: boolean;
  canShowSaveAction: boolean;
  saveButtonLabel: string;
  saveDisabled: boolean;
  saveTitle?: string;
  onResetPlan: () => void;
  onSavePlan: () => void;
  onDiscardDraftChanges: () => void;
  onOpenSettings: () => void;
  showSettingsButton: boolean;
  discardDisabled: boolean;
}

export function CalendarSurfaceHeader({
  hasDraftSession,
  horizonCounter,
  eligibilityNotices,
  canResetPlan,
  resetLoading,
  loading,
  canShowSaveAction,
  saveButtonLabel,
  saveDisabled,
  saveTitle,
  onResetPlan,
  onSavePlan,
  onDiscardDraftChanges,
  onOpenSettings,
  showSettingsButton,
  discardDisabled,
}: CalendarSurfaceHeaderProps) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm" data-no-swipe="true">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <h2 className="text-lg font-semibold">Calendar</h2>
              {hasDraftSession ? (
                <Badge className="h-7 border-yellow-300 bg-yellow-100 px-3 text-sm font-semibold text-orange-900 dark:border-yellow-300 dark:bg-yellow-100 dark:text-orange-900">
                  Planning Mode
                </Badge>
              ) : null}
            </div>
            {horizonCounter ? (
              <p className="text-xs text-muted-foreground">
                {horizonCounter.thisMonth} this month / {horizonCounter.total} total{" "}
                {horizonCounter.remaining > 0
                  ? `· ${horizonCounter.remaining} remaining`
                  : "· all credited"}
              </p>
            ) : null}
            {eligibilityNotices.hardIneligible.length > 0 ? (
              <div className="rounded-md border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                {eligibilityNotices.hardIneligible
                  .slice(0, 4)
                  .map((item) => `${item.goalTitle}: ${item.reasonCopy}`)
                  .join(" · ")}
                {eligibilityNotices.hardIneligible.length > 4
                  ? ` · +${eligibilityNotices.hardIneligible.length - 4} more`
                  : ""}
              </div>
            ) : null}
            {eligibilityNotices.scopeOnlyCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {eligibilityNotices.scopeOnlyCount} goal
                {eligibilityNotices.scopeOnlyCount === 1 ? "" : "s"} outside this
                month&apos;s planning scope.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canResetPlan ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={onResetPlan}
                disabled={loading || resetLoading}
              >
                {resetLoading ? "Resetting..." : "Reset plan"}
              </Button>
            ) : canShowSaveAction ? (
              <Button
                type="button"
                size="sm"
                onClick={onSavePlan}
                title={saveTitle}
                disabled={saveDisabled}
              >
                {saveButtonLabel}
              </Button>
            ) : null}
            {hasDraftSession ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDiscardDraftChanges}
                disabled={discardDisabled}
              >
                Undo changes
              </Button>
            ) : null}
            {showSettingsButton ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Settings"
                title="Settings"
                onClick={onOpenSettings}
                disabled={loading}
              >
                <Settings className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
