"use client";

import { Button } from "@/components/ui/button";
import { restWeekdayOptions } from "@/features/planner/calendar-format";

interface PlannerSettingsFormProps {
  setupRestWeekdays: number[];
  onSetupRestWeekdaysChange: (next: number[]) => void;
  setupLoading: boolean;
  plannerReadOnly: boolean;
  recoverLoading: boolean;
  loading: boolean;
  saveLoading: boolean;
  canRecoverPastSessions: boolean;
  canResetPlan: boolean;
  resetLoading: boolean;
  rebuildLoading: boolean;
  hasDraftSession: boolean;
  canShowSaveAction: boolean;
  rebuildBlockedMessage: string | undefined;
  fullResetLoading: boolean;
  onSaveSettings: () => void;
  onRecover: () => void;
  onUnlockAllGoals: () => void;
  onRefreshCalendar: () => void;
  onFullReset: () => void;
}

export function PlannerSettingsForm({
  setupRestWeekdays,
  onSetupRestWeekdaysChange,
  setupLoading,
  plannerReadOnly,
  recoverLoading,
  loading,
  saveLoading,
  canRecoverPastSessions,
  canResetPlan,
  resetLoading,
  rebuildLoading,
  hasDraftSession,
  canShowSaveAction,
  rebuildBlockedMessage,
  fullResetLoading,
  onSaveSettings,
  onRecover,
  onUnlockAllGoals,
  onRefreshCalendar,
  onFullReset,
}: PlannerSettingsFormProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Timezone and first-day-of-week preferences now live in Profile settings.
      </p>
      <div className="space-y-2 text-sm">
        <p>Rest weekdays</p>
        <div className="flex flex-wrap gap-2">
          {restWeekdayOptions.map((option) => (
            <label
              key={option.label}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={setupRestWeekdays.includes(option.value)}
                onChange={(event) =>
                  onSetupRestWeekdaysChange(
                    event.target.checked
                      ? Array.from(new Set([...setupRestWeekdays, option.value])).sort(
                          (left, right) => left - right
                        )
                      : setupRestWeekdays.filter((weekday) => weekday !== option.value)
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      <Button type="button" onClick={onSaveSettings} disabled={setupLoading}>
        {setupLoading ? "Saving settings..." : "Save settings"}
      </Button>
      {!plannerReadOnly ? (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            Use these tools to refresh the current calendar projection or clear lock-based
            blockers.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onRecover}
              title="Recover missed activities that were left behind in the past"
              disabled={recoverLoading || loading || saveLoading || !canRecoverPastSessions}
            >
              {recoverLoading ? "Recovering missed activities..." : "Recover missed activities"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onUnlockAllGoals}
              title={!canResetPlan ? "No locked goals to unlock." : undefined}
              disabled={loading || resetLoading || !canResetPlan}
            >
              {resetLoading ? "Unlocking..." : "Unlock all goals"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onRefreshCalendar}
              title={rebuildBlockedMessage}
              disabled={rebuildLoading || loading || hasDraftSession || !canShowSaveAction}
            >
              {rebuildLoading ? "Refreshing..." : "Refresh calendar"}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs text-muted-foreground">
          Full reset clears planner schedule snapshots across the active 24-month horizon.
        </p>
        <Button
          type="button"
          variant="destructive"
          onClick={onFullReset}
          disabled={fullResetLoading || loading || resetLoading}
        >
          {fullResetLoading ? "Running full reset..." : "Full reset planner"}
        </Button>
      </div>
    </div>
  );
}
