"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_PRESETS, type CategorySelection, getCategorySwatchColor } from "@/lib/goals/category";
import { GOAL_TYPE_OPTIONS, RECURRENCE_INTERVAL_OPTIONS } from "@/lib/goals/form-options";
import type { GoalFrequencyType } from "@/lib/goals/types";
import type { GroupGoalDraft } from "./social-models";

interface SocialGroupGoalComposerProps {
  groupDraft: GroupGoalDraft;
  groupRequiresEndDate: boolean;
  saving: boolean;
  onDraftChange: (updater: (previous: GroupGoalDraft) => GroupGoalDraft) => void;
  onFrequencyTypeChange: (nextFrequency: GoalFrequencyType) => void;
  onCreateGroupGoal: () => void;
}

export function SocialGroupGoalComposer({
  groupDraft,
  groupRequiresEndDate,
  saving,
  onDraftChange,
  onFrequencyTypeChange,
  onCreateGroupGoal,
}: SocialGroupGoalComposerProps) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="mb-3 text-sm font-medium">Create group goal</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="group-goal-title">Title</Label>
          <Input
            id="group-goal-title"
            placeholder="Title"
            value={groupDraft.title}
            onChange={(event) =>
              onDraftChange((previous) => ({ ...previous, title: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={groupDraft.categorySelection}
            onValueChange={(value: CategorySelection) =>
              onDraftChange((previous) => ({ ...previous, categorySelection: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: getCategorySwatchColor(preset.id) }}
                    />
                    {preset.label}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value="custom">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: getCategorySwatchColor("custom") }}
                  />
                  Custom
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Goal type</Label>
          <div className="flex flex-wrap gap-2">
            {GOAL_TYPE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={groupDraft.frequencyType === option.value ? "secondary" : "outline"}
                className="rounded-full"
                onClick={() => onFrequencyTypeChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        {groupDraft.frequencyType === "recurring" ? (
          <div className="space-y-2">
            <Label>Recurrence interval</Label>
            <div className="flex flex-wrap gap-2">
              {RECURRENCE_INTERVAL_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={
                    groupDraft.recurrenceInterval === option.value
                      ? "secondary"
                      : "outline"
                  }
                  className="rounded-full"
                  onClick={() =>
                    onDraftChange((previous) => ({
                      ...previous,
                      recurrenceInterval: option.value,
                    }))
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {groupDraft.frequencyType === "fixed_milestones" ||
        groupDraft.frequencyType === "recurring" ? (
          <div className="space-y-2">
            <Label htmlFor="group-target-count">
              {groupDraft.frequencyType === "fixed_milestones"
                ? "Target count"
                : "Target completions (optional)"}
            </Label>
            <Input
              id="group-target-count"
              type="number"
              min={groupDraft.frequencyType === "fixed_milestones" ? 1 : 0}
              value={groupDraft.targetCount}
              onChange={(event) =>
                onDraftChange((previous) => ({
                  ...previous,
                  targetCount: event.target.value,
                }))
              }
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="group-start-date">Start date</Label>
          <Input
            id="group-start-date"
            type="date"
            value={groupDraft.startDate}
            onChange={(event) =>
              onDraftChange((previous) => ({
                ...previous,
                startDate: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-end-date">
            {groupRequiresEndDate ? "End date" : "End date (optional)"}
          </Label>
          <Input
            id="group-end-date"
            type="date"
            value={groupDraft.endDate}
            onChange={(event) =>
              onDraftChange((previous) => ({
                ...previous,
                endDate: event.target.value,
              }))
            }
            required={groupRequiresEndDate}
          />
        </div>
      </div>
      <Input
        className="mt-3"
        placeholder="Description"
        value={groupDraft.description}
        onChange={(event) =>
          onDraftChange((previous) => ({
            ...previous,
            description: event.target.value,
          }))
        }
      />
      {groupDraft.categorySelection === "custom" ? (
        <Input
          className="mt-3"
          placeholder="Custom category label"
          value={groupDraft.customCategory}
          onChange={(event) =>
            onDraftChange((previous) => ({
              ...previous,
              customCategory: event.target.value,
            }))
          }
        />
      ) : null}
      <Button className="mt-3" type="button" onClick={onCreateGroupGoal} disabled={saving}>
        <Plus className="size-4" />
        Create group goal
      </Button>
    </div>
  );
}
