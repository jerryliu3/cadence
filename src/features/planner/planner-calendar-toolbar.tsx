"use client";

import { CalendarDays, CircleHelp, Settings, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import type { PlannerCalendarViewMode } from "@/features/planner/calendar-surface.types";
import type { PlannerEligibilityNotices } from "@/features/planner/planner-eligibility-notices";

const PLANNER_VIEW_MODES: ReadonlyArray<{
  value: PlannerCalendarViewMode;
  label: string;
}> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "three_day", label: "3 Day" },
  { value: "day", label: "Day" },
];

interface PlannerCalendarToolbarProps {
  hasDraftSession: boolean;
  plannerReadOnly: boolean;
  canShowSaveAction: boolean;
  saveButtonLabel: string;
  draftSaveBlockedMessage: string | null;
  saveDisabled: boolean;
  undoDisabled: boolean;
  loading: boolean;
  viewMode: PlannerCalendarViewMode;
  canOpenSettings: boolean;
  linkedTargetDetails: PlannerEligibilityNotices["linkedTargetDetails"];
  searchQuery: string;
  onSave: () => void;
  onDiscardDraftChanges: () => void;
  onViewModeChange: (viewMode: PlannerCalendarViewMode) => void;
  onOpenFilters: () => void;
  onOpenSettings: () => void;
  onSearchQueryChange: (query: string) => void;
}

export function PlannerCalendarToolbar({
  hasDraftSession,
  plannerReadOnly,
  canShowSaveAction,
  saveButtonLabel,
  draftSaveBlockedMessage,
  saveDisabled,
  undoDisabled,
  loading,
  viewMode,
  canOpenSettings,
  linkedTargetDetails,
  searchQuery,
  onSave,
  onDiscardDraftChanges,
  onViewModeChange,
  onOpenFilters,
  onOpenSettings,
  onSearchQueryChange,
}: PlannerCalendarToolbarProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [showHiddenGoals, setShowHiddenGoals] = useState(false);
  const hiddenLinkedGoalCount = linkedTargetDetails.length;

  return (
    <div
      className="rounded-xl border bg-card p-4 shadow-sm"
      data-testid="planner-calendar-toolbar"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <h2 className="text-lg font-semibold">Calendar</h2>
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
              {hasDraftSession ? (
                <Badge
                  data-testid="planner-preview-mode-badge"
                  className="h-7 border-amber-300 bg-amber-100 px-3 text-sm font-semibold text-amber-950 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-950"
                >
                  Planning Mode
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!plannerReadOnly && canShowSaveAction && hasDraftSession ? (
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                title={draftSaveBlockedMessage ?? undefined}
                disabled={saveDisabled}
              >
                {saveButtonLabel}
              </Button>
            ) : null}
            {plannerReadOnly ? (
              <span className="text-xs text-muted-foreground">
                Partner completions (view only)
              </span>
            ) : null}
            {hasDraftSession ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDiscardDraftChanges}
                disabled={undoDisabled}
              >
                Undo
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex w-full items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              id="planner-calendar-search"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Filter by goal or milestone name"
              className="h-8 w-full text-xs"
              aria-label="Search goals"
              disabled={loading}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={viewMode}
              onValueChange={(value) => onViewModeChange(value as PlannerCalendarViewMode)}
            >
              <SelectTrigger
                className="h-8 w-[7.5rem] rounded-md bg-background/90 text-xs"
                disabled={loading}
                aria-label="Calendar view mode"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANNER_VIEW_MODES.map((modeOption) => (
                  <SelectItem key={modeOption.value} value={modeOption.value}>
                    {modeOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Filters"
              title="Filters"
              onClick={onOpenFilters}
              disabled={loading}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
            {canOpenSettings ? (
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
