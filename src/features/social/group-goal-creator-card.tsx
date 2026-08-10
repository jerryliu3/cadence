"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelect, GoalTypeToggle, RecurrenceIntervalToggle, TargetCountField } from "@/features/goals/goal-field-kit";
import { GoalDateRangeFields } from "@/features/goals/goal-schedule-fields";
import type { CategorySelection } from "@/lib/goals/category";
import { toLocalDateString } from "@/lib/dates/day";
import type { GoalFrequencyType, RecurrenceInterval } from "@/lib/goals/types";

export interface GroupGoalDraft {
  title: string;
  description: string;
  categorySelection: CategorySelection;
  customCategory: string;
  frequencyType: GoalFrequencyType;
  recurrenceInterval: RecurrenceInterval;
  targetCount: string;
  startDate: string;
  endDate: string;
}

export function createDefaultGroupGoalDraft(): GroupGoalDraft {
  return {
    title: "",
    description: "",
    categorySelection: "personal",
    customCategory: "",
    frequencyType: "recurring",
    recurrenceInterval: "weekly",
    targetCount: "",
    startDate: toLocalDateString(),
    endDate: "",
  };
}

interface GroupGoalCreatorCardProps {
  draft: GroupGoalDraft;
  saving: boolean;
  requiresEndDate: boolean;
  onDraftChange: (updater: (previous: GroupGoalDraft) => GroupGoalDraft) => void;
  onFrequencyTypeChange: (nextFrequency: GroupGoalDraft["frequencyType"]) => void;
  onCreateGoal: () => void;
}

export function GroupGoalCreatorCard({
  draft,
  saving,
  requiresEndDate,
  onDraftChange,
  onFrequencyTypeChange,
  onCreateGoal,
}: GroupGoalCreatorCardProps) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="mb-3 text-sm font-medium">Create group goal</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="group-goal-title">Title</Label>
          <Input
            id="group-goal-title"
            placeholder="Title"
            value={draft.title}
            onChange={(event) =>
              onDraftChange((previous) => ({ ...previous, title: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <CategorySelect
            value={draft.categorySelection}
            onValueChange={(value) =>
              onDraftChange((previous) => ({ ...previous, categorySelection: value }))
            }
            placeholder="Category"
          />
        </div>
        <div className="space-y-2">
          <Label>Goal type</Label>
          <GoalTypeToggle value={draft.frequencyType} onValueChange={onFrequencyTypeChange} />
        </div>
        {draft.frequencyType === "recurring" ? (
          <div className="space-y-2">
            <Label>Recurrence interval</Label>
            <RecurrenceIntervalToggle
              value={draft.recurrenceInterval}
              onValueChange={(value) =>
                onDraftChange((previous) => ({
                  ...previous,
                  recurrenceInterval: value,
                }))
              }
            />
          </div>
        ) : null}
        {draft.frequencyType === "fixed_milestones" || draft.frequencyType === "recurring" ? (
          <div className="space-y-2">
            <Label htmlFor="group-target-count">
              {draft.frequencyType === "fixed_milestones"
                ? "Target count"
                : "Target completions (optional)"}
            </Label>
            <TargetCountField
              id="group-target-count"
              frequencyType={draft.frequencyType}
              value={draft.targetCount}
              onValueChange={(value) =>
                onDraftChange((previous) => ({ ...previous, targetCount: value }))
              }
            />
          </div>
        ) : null}
        <GoalDateRangeFields
          startDate={draft.startDate}
          endDate={draft.endDate}
          onStartDateChange={(value) =>
            onDraftChange((previous) => ({ ...previous, startDate: value }))
          }
          onEndDateChange={(value) =>
            onDraftChange((previous) => ({ ...previous, endDate: value }))
          }
          requiresEndDate={requiresEndDate}
          startDateId="group-start-date"
          endDateId="group-end-date"
        />
      </div>
      <Input
        className="mt-3"
        placeholder="Description"
        value={draft.description}
        onChange={(event) =>
          onDraftChange((previous) => ({ ...previous, description: event.target.value }))
        }
      />
      {draft.categorySelection === "custom" ? (
        <Input
          className="mt-3"
          placeholder="Custom category label"
          value={draft.customCategory}
          onChange={(event) =>
            onDraftChange((previous) => ({
              ...previous,
              customCategory: event.target.value,
            }))
          }
        />
      ) : null}
      <Button className="mt-3" type="button" onClick={onCreateGoal} disabled={saving}>
        <Plus className="size-4" />
        Create group goal
      </Button>
    </div>
  );
}
