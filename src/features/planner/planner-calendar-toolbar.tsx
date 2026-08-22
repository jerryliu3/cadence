"use client";

import { CalendarDays, Settings, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlannerCalendarViewMode } from "@/features/planner/calendar-surface.types";

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
  searchQuery,
  onSave,
  onDiscardDraftChanges,
  onViewModeChange,
  onOpenFilters,
  onOpenSettings,
  onSearchQueryChange,
}: PlannerCalendarToolbarProps) {
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
            {!plannerReadOnly && canShowSaveAction ? (
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
              <span className="text-xs font-medium text-blue-800 dark:text-blue-300">
                Partner completions (read-only)
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
                Undo changes
              </Button>
            ) : null}
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
        <div className="w-full">
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
      </div>
    </div>
  );
}
