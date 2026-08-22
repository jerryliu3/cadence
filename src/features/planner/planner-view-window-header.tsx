"use client";

import { CircleHelp, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PeriodStepper } from "@/components/ui/period-stepper";
import { Tooltip } from "@/components/ui/tooltip";
import type { PlannerCalendarViewMode } from "@/features/planner/calendar-surface.types";
import type { PlannerEligibilityNotices } from "@/features/planner/planner-eligibility-notices";

interface PlannerViewWindowHeaderProps {
  loading: boolean;
  viewMode: PlannerCalendarViewMode;
  previousWindowAriaLabel: string;
  nextWindowAriaLabel: string;
  fixedViewHeadingWidthCh: number;
  viewHeading: string;
  showTodayShortcut: boolean;
  expandedMonthRows: boolean;
  linkedTargetDetails: PlannerEligibilityNotices["linkedTargetDetails"];
  onMoveViewWindow: (direction: -1 | 1) => void;
  onJumpToToday: () => void;
  onToggleExpandedMonthRows: () => void;
}

export function PlannerViewWindowHeader({
  loading,
  viewMode,
  previousWindowAriaLabel,
  nextWindowAriaLabel,
  fixedViewHeadingWidthCh,
  viewHeading,
  showTodayShortcut,
  expandedMonthRows,
  linkedTargetDetails,
  onMoveViewWindow,
  onJumpToToday,
  onToggleExpandedMonthRows,
}: PlannerViewWindowHeaderProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [showHiddenGoals, setShowHiddenGoals] = useState(false);
  const hiddenLinkedGoalCount = linkedTargetDetails.length;

  return (
    <div className="mx-auto mb-3 w-full max-w-[56rem] space-y-3">
      <div className="space-y-2">
        <div className="relative flex w-full justify-center">
          <PeriodStepper
            className="shrink-0"
            onPrevious={() => onMoveViewWindow(-1)}
            onNext={() => onMoveViewWindow(1)}
            previousDisabled={loading}
            nextDisabled={loading}
            previousAriaLabel={previousWindowAriaLabel}
            nextAriaLabel={nextWindowAriaLabel}
            center={
              <h3
                className="truncate text-center text-base font-semibold"
                style={{ width: `${fixedViewHeadingWidthCh}ch` }}
              >
                {viewHeading}
              </h3>
            }
          />
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <Tooltip content="Calendar help" side="top" align="center">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Open calendar help"
                title="Calendar help"
                onClick={() => setHelpOpen(true)}
              >
                <CircleHelp className="size-4" />
              </Button>
            </Tooltip>
            {viewMode === "month" ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={loading}
                aria-label={expandedMonthRows ? "Compact rows" : "Expand rows"}
                title={expandedMonthRows ? "Compact rows" : "Expand rows"}
                onClick={onToggleExpandedMonthRows}
              >
                {expandedMonthRows ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex min-h-8 items-center justify-center">
        {showTodayShortcut ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onJumpToToday}
          >
            Today
          </Button>
        ) : loading ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Updating...
          </span>
        ) : null}
      </div>
      <Dialog
        open={helpOpen}
        onOpenChange={(open) => {
          setHelpOpen(open);
          if (!open) {
            setShowHiddenGoals(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calendar help</DialogTitle>
            <DialogDescription>
              Use this calendar to preview scheduling changes before saving them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              <li>Switch between day, 3-day, week, and month views.</li>
              <li>Drag sessions or use the detail editor to move dates and time overrides.</li>
              <li>
                Regenerate from planner settings when needed, then save once the preview looks
                right.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Linked main goals are hidden for clarity while linked source goals remain active.
            </p>
            {hiddenLinkedGoalCount > 0 ? (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-950">
                <p>
                  {hiddenLinkedGoalCount} linked main goal
                  {hiddenLinkedGoalCount === 1 ? " is" : "s are"} currently hidden in this
                  preview window.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowHiddenGoals((current) => !current)}
                >
                  {showHiddenGoals ? "Hide hidden goals" : "See hidden goals"}
                </Button>
                {showHiddenGoals ? (
                  <div
                    className={`space-y-1 rounded-md border border-amber-300/70 bg-white/70 p-2 text-xs text-amber-950 ${
                      hiddenLinkedGoalCount > 5 ? "max-h-36 overflow-y-auto pr-1" : ""
                    }`}
                  >
                    {linkedTargetDetails.map((detail) => (
                      <p key={`linked-target-help-${detail.goalId}`}>
                        {detail.goalTitle}: {detail.statusCopy}
                        {detail.sourceGoalTitles.length > 0
                          ? ` Linked source goals: ${detail.sourceGoalTitles.join(", ")}.`
                          : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => setHelpOpen(false)}>
              Back to calendar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
