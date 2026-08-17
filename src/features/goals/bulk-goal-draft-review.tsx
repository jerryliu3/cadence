"use client";

import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useMemo,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TooltipIcon } from "@/components/ui/tooltip-icon";
import {
  type BulkGoalDraft,
  bulkGoalDraftRequiresEndDate,
  normalizeBulkGoalLocalTime,
  parseBulkGoalTargetCount,
  summarizeBulkGoalDraftSchedule,
  withValidatedBulkGoalDraft,
} from "@/features/goals/bulk-goal-drafts";
import {
  CategorySelect,
  GoalTypeToggle,
  RecurrenceIntervalToggle,
  TargetCountField,
} from "@/features/goals/goal-field-kit";
import { GoalLinkTargetSelect } from "@/features/goals/goal-link-target-select";
import { MilestoneNameFields } from "@/features/goals/milestone-name-fields";
import {
  GoalDateRangeFields,
  GoalDefaultTimeField,
} from "@/features/goals/goal-schedule-fields";
import {
  type CategorySelection,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import {
  getLinkedGoalDeadlineLabel,
  getLinkedGoalRecurrenceLabel,
} from "@/lib/goals/linked-goal-labels";
import { buildMilestoneNameDrafts } from "@/lib/goals/milestones";
import type { Goal } from "@/lib/goals/types";
import { cn } from "@/lib/utils";

export interface BulkGoalDraftReviewProps {
  variant: "full" | "coach";
  drafts: BulkGoalDraft[];
  setDrafts: Dispatch<SetStateAction<BulkGoalDraft[]>>;
  saving: boolean;
  onCreate: () => void | Promise<void>;
  availableGoals?: Goal[];
  warnings?: string[];
  emptyMessage?: string;
  createLabel?: string;
  createDisabledMessage?: string | null;
}

export function BulkGoalDraftReview({
  variant,
  drafts,
  setDrafts,
  saving,
  onCreate,
  availableGoals = [],
  warnings = [],
  emptyMessage = "Generate drafts to review and edit them.",
  createLabel = "Create selected goals",
  createDisabledMessage = null,
}: BulkGoalDraftReviewProps) {
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const selectedDrafts = useMemo(
    () => drafts.filter((draft) => draft.include),
    [drafts]
  );
  const selectedInvalidCount = useMemo(
    () => selectedDrafts.filter((draft) => draft.errors.length > 0).length,
    [selectedDrafts]
  );

  const updateDraft = (
    draftId: string,
    updater: (
      draft: Omit<BulkGoalDraft, "errors">
    ) => Omit<BulkGoalDraft, "errors">
  ) => {
    setDrafts((previous) =>
      previous.map((draft) =>
        draft.id === draftId
          ? withValidatedBulkGoalDraft(updater(draft))
          : draft
      )
    );
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Preview drafts</CardTitle>
            <CardDescription>
              Review and edit parsed goals before creating them.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selectedDrafts.length} selected</Badge>
            <Badge variant="outline">
              {selectedInvalidCount} selected with errors
            </Badge>
            <Button
              type="button"
              onClick={() => void onCreate()}
              disabled={
                saving ||
                selectedDrafts.length === 0 ||
                selectedInvalidCount > 0 ||
                Boolean(createDisabledMessage)
              }
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {createLabel}
            </Button>
          </div>
        </div>
        {createDisabledMessage ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {createDisabledMessage}
          </p>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          drafts.map((draft) => {
            const parsedTargetCount = parseBulkGoalTargetCount(
              draft.target_count
            );
            const fixedMilestoneCount =
              draft.frequency_type === "fixed_milestones"
                ? parsedTargetCount ?? 0
                : 0;
            const linkQuery = draft.link_target_search.trim().toLowerCase();
            const filteredLinkTargets = availableGoals.filter((goal) => {
              if (!linkQuery) return true;
              return (
                goal.title.toLowerCase().includes(linkQuery) ||
                getLinkedGoalRecurrenceLabel(goal)
                  .toLowerCase()
                  .includes(linkQuery) ||
                getLinkedGoalDeadlineLabel(goal)
                  .toLowerCase()
                  .includes(linkQuery)
              );
            });
            const expanded = expandedDraftId === draft.id;
            const toggleDraftEditor = () =>
              setExpandedDraftId((previous) =>
                previous === draft.id ? null : draft.id
              );

            return (
              <div key={draft.id} className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="inline-flex shrink-0 items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={draft.include}
                      onChange={(event) =>
                        updateDraft(draft.id, (previous) => ({
                          ...previous,
                          include: event.target.checked,
                        }))
                      }
                    />
                    {draft.sourceRowLabel}
                  </label>
                  <div
                    className={cn(
                      "min-w-0 flex-1 cursor-pointer rounded-lg border bg-muted/10 px-3 py-2 transition-colors hover:bg-muted/20",
                      draft.include &&
                        draft.errors.length > 0 &&
                        "border-destructive/50"
                    )}
                    role="button"
                    tabIndex={0}
                    onClick={toggleDraftEditor}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleDraftEditor();
                      }
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">
                          {draft.title.trim() || "Untitled goal"}
                        </span>
                        <Badge variant="outline">
                          {draft.category_selection}
                        </Badge>
                        <Badge variant="outline">
                          {summarizeBulkGoalDraftSchedule(draft)}
                        </Badge>
                        {draft.errors.length > 0 ? (
                          <Badge variant="destructive">
                            {draft.errors.length} error
                            {draft.errors.length === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="px-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleDraftEditor();
                          }}
                        >
                          {expanded ? "close" : "tap to edit"}
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDrafts((previous) =>
                              previous.filter(
                                (entry) => entry.id !== draft.id
                              )
                            );
                            setExpandedDraftId((previous) =>
                              previous === draft.id ? null : previous
                            );
                          }}
                          aria-label={`Remove ${draft.title || "draft"}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {draft.errors.length > 0 ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                    <ul className="space-y-1 text-xs text-destructive">
                      {draft.errors.map((error) => (
                        <li key={`${draft.id}-${error}`}>- {error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {expanded ? (
                  <Dialog
                    open
                    onOpenChange={(open) => {
                      if (!open) setExpandedDraftId(null);
                    }}
                  >
                    <DialogContent
                      overlayClassName="z-[115] bg-black/15"
                      className="z-[120] max-h-[88vh] overflow-y-auto sm:!max-w-none"
                      style={{
                        width: "min(calc(100vw - 1.5rem), 62rem)",
                        maxWidth: "min(calc(100vw - 1.5rem), 62rem)",
                      }}
                    >
                      <DialogHeader>
                        <DialogTitle>
                          {draft.title.trim() || "Edit goal draft"}
                        </DialogTitle>
                        <DialogDescription>
                          Update this draft before creating goals.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`${draft.id}-title`}>Title</Label>
                          <Input
                            id={`${draft.id}-title`}
                            value={draft.title}
                            onChange={(event) =>
                              updateDraft(draft.id, (previous) => ({
                                ...previous,
                                title: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Category</Label>
                          <CategorySelect
                            value={draft.category_selection}
                            onValueChange={(value: CategorySelection) =>
                              updateDraft(draft.id, (previous) => ({
                                ...previous,
                                category_selection: value,
                                color: getCategorySwatchColor(value),
                              }))
                            }
                          />
                        </div>
                        {draft.category_selection === "custom" ? (
                          <div className="space-y-2">
                            <Label htmlFor={`${draft.id}-custom-category`}>
                              Custom category
                            </Label>
                            <Input
                              id={`${draft.id}-custom-category`}
                              value={draft.custom_category}
                              onChange={(event) =>
                                updateDraft(draft.id, (previous) => ({
                                  ...previous,
                                  custom_category: event.target.value,
                                }))
                              }
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="inline-flex items-center gap-1">
                            <span>Goal type</span>
                            <TooltipIcon
                              content="Repeated keeps the same action pattern over time. Milestones are unique steps that move you toward a final outcome."
                              label="Goal type help"
                            />
                          </Label>
                          <GoalTypeToggle
                            value={draft.frequency_type}
                            onValueChange={(value) =>
                              updateDraft(draft.id, (previous) => {
                                const nextTargetCount =
                                  value === "fixed_milestones" &&
                                  !previous.target_count.trim()
                                    ? "3"
                                    : previous.target_count;
                                return {
                                  ...previous,
                                  frequency_type: value,
                                  target_count: nextTargetCount,
                                  milestone_names:
                                    value === "fixed_milestones"
                                      ? buildMilestoneNameDrafts(
                                          parseBulkGoalTargetCount(
                                            nextTargetCount
                                          ) ?? 0,
                                          previous.milestone_names
                                        )
                                      : previous.milestone_names,
                                };
                              })
                            }
                          />
                        </div>
                        {draft.frequency_type === "recurring" ? (
                          <div className="space-y-2">
                            <Label className="inline-flex items-center gap-1">
                              <span>Cadence</span>
                              <TooltipIcon
                                content="Cadence controls how often the goal appears in your routine."
                                label="Cadence help"
                              />
                            </Label>
                            <RecurrenceIntervalToggle
                              value={draft.recurrence_interval}
                              onValueChange={(value) =>
                                updateDraft(draft.id, (previous) => ({
                                  ...previous,
                                  recurrence_interval: value,
                                }))
                              }
                            />
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <Label>
                            {draft.frequency_type === "fixed_milestones"
                              ? "Total target #"
                              : "Total target # (optional)"}
                          </Label>
                          <TargetCountField
                            frequencyType={draft.frequency_type}
                            value={draft.target_count}
                            onValueChange={(value) =>
                              updateDraft(draft.id, (previous) => ({
                                ...previous,
                                target_count: value,
                                milestone_names:
                                  previous.frequency_type ===
                                  "fixed_milestones"
                                    ? buildMilestoneNameDrafts(
                                        parseBulkGoalTargetCount(value) ?? 0,
                                        previous.milestone_names
                                      )
                                    : previous.milestone_names,
                              }))
                            }
                          />
                        </div>
                        <GoalDateRangeFields
                          startDate={draft.start_date}
                          endDate={draft.end_date}
                          onStartDateChange={(value) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              start_date: value,
                            }))
                          }
                          onEndDateChange={(value) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              end_date: value,
                            }))
                          }
                          requiresEndDate={bulkGoalDraftRequiresEndDate(draft)}
                        />
                        <GoalDefaultTimeField
                          value={draft.default_local_time}
                          onValueChange={(value) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              default_local_time:
                                normalizeBulkGoalLocalTime(value),
                            }))
                          }
                          label="Default time of day"
                          helperText="Optional fallback planner time when no item override is set."
                        />
                      </div>

                      {fixedMilestoneCount > 0 ? (
                        <MilestoneNameFields
                          count={fixedMilestoneCount}
                          values={draft.milestone_names}
                          onValueChange={(index, value) =>
                            updateDraft(draft.id, (previous) => {
                              const milestoneNames = [
                                ...previous.milestone_names,
                              ];
                              milestoneNames[index] = value;
                              return {
                                ...previous,
                                milestone_names: milestoneNames,
                              };
                            })
                          }
                          keyPrefix={`${draft.id}-milestone`}
                        />
                      ) : null}

                      {variant === "full" ? (
                        <Collapsible
                          open={draft.advanced_open}
                          onOpenChange={(open) =>
                            updateDraft(draft.id, (previous) => ({
                              ...previous,
                              advanced_open: open,
                            }))
                          }
                        >
                          <div className="rounded-xl border bg-muted/20">
                            <CollapsibleTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                className="flex h-auto w-full items-center justify-between rounded-xl px-3 py-2 text-sm"
                              >
                                <span>Advanced settings (optional)</span>
                                {draft.advanced_open ? (
                                  <ChevronUp className="size-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="size-4 text-muted-foreground" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="space-y-4 border-t px-3 py-3">
                                <div className="space-y-2">
                                  <Label
                                    htmlFor={`${draft.id}-description`}
                                  >
                                    Description
                                  </Label>
                                  <Textarea
                                    id={`${draft.id}-description`}
                                    value={draft.description}
                                    onChange={(event) =>
                                      updateDraft(draft.id, (previous) => ({
                                        ...previous,
                                        description: event.target.value,
                                      }))
                                    }
                                    placeholder="Why this goal matters"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Color accent</Label>
                                  <Input
                                    type="color"
                                    value={draft.color}
                                    onChange={(event) =>
                                      updateDraft(draft.id, (previous) => ({
                                        ...previous,
                                        color: event.target.value,
                                      }))
                                    }
                                    className="h-10 p-1"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Photo</Label>
                                  <Input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(event) =>
                                      updateDraft(draft.id, (previous) => ({
                                        ...previous,
                                        photo_file:
                                          event.target.files?.[0] ?? null,
                                      }))
                                    }
                                  />
                                  {draft.photo_file ? (
                                    <Badge variant="secondary">
                                      {draft.photo_file.name}
                                    </Badge>
                                  ) : null}
                                </div>
                                <GoalLinkTargetSelect
                                  value={draft.linked_target_goal_id}
                                  onValueChange={(value) =>
                                    updateDraft(draft.id, (previous) => ({
                                      ...previous,
                                      linked_target_goal_id: value,
                                    }))
                                  }
                                  open={draft.link_target_open}
                                  onOpenChange={(open) =>
                                    updateDraft(draft.id, (previous) => ({
                                      ...previous,
                                      link_target_open: open,
                                      link_target_search: open
                                        ? previous.link_target_search
                                        : "",
                                    }))
                                  }
                                  searchQuery={draft.link_target_search}
                                  onSearchQueryChange={(value) =>
                                    updateDraft(draft.id, (previous) => ({
                                      ...previous,
                                      link_target_search: value,
                                    }))
                                  }
                                  filteredLinkTargets={filteredLinkTargets}
                                  selectedTargetGoal={
                                    draft.linked_target_goal_id === "none"
                                      ? null
                                      : availableGoals.find(
                                          (goal) => goal.id === draft.linked_target_goal_id
                                        ) ?? null
                                  }
                                  sourceEndDate={draft.end_date.trim() || null}
                                  keyPrefix={draft.id}
                                />
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ) : null}
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
