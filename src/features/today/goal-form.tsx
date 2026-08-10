"use client";

import {
  ArrowLeft,
  Archive,
  ChevronDown,
  ChevronUp,
  Link2,
  LoaderCircle,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toLocalDateString } from "@/lib/dates/day";
import { GoalsSurfaceLoadingCard } from "@/features/goals/goals-surface-loading-card";
import {
  CATEGORY_PRESETS,
  type CategorySelection,
  getCategorySelectionFromValue,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import {
  canShowRecurrenceFields as canShowRecurrenceFieldsForGoal,
  canShowTargetCount as canShowTargetCountForGoal,
  deriveDefinitionTargetCount,
  getFixedMilestoneCount,
  requiresGoalEndDate,
} from "@/lib/goals/form-derivations";
import {
  getThisMonthEndDate,
  getThisMonthStartDate,
  getThisYearEndDate,
  getThisYearStartDate,
} from "@/lib/goals/form-dates";
import { GOAL_TYPE_OPTIONS, RECURRENCE_INTERVAL_OPTIONS } from "@/lib/goals/form-options";
import { buildGoalRowPayload } from "@/lib/goals/form-payload";
import {
  parseGoalTargetCount,
} from "@/lib/goals/form-parsing";
import {
  applyFrequencyTypeChange,
  applyMilestoneNameChange,
  applyTargetCountChange,
} from "@/lib/goals/form-state-transitions";
import {
  getFirstGoalFormValidationError,
} from "@/lib/goals/form-validation";
import {
  fetchProgressContext,
  progressSummaryMap,
} from "@/lib/goals/progress-context";
import { getLinkedGoalDeadlineLabel, getLinkedGoalRecurrenceLabel } from "@/lib/goals/linked-goal-labels";
import {
  filterGoalsByLinkSearch,
  filterLinkableGoals,
} from "@/lib/goals/linkable-goals";
import {
  buildMilestoneNameDrafts,
  defaultMilestoneName,
} from "@/lib/goals/milestones";
import type { Goal, GoalFrequencyType, GoalLink, RecurrenceInterval } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";

interface GoalFormProps {
  goalId?: string;
}

interface GoalFormState {
  title: string;
  description: string;
  category_selection: CategorySelection;
  custom_category: string;
  color: string;
  frequency_type: GoalFrequencyType;
  recurrence_interval: RecurrenceInterval;
  target_count: string;
  milestone_names: string[];
  start_date: string;
  end_date: string;
  default_local_time: string;
  is_group: boolean;
}

const defaultState: GoalFormState = {
  title: "",
  description: "",
  category_selection: "personal",
  custom_category: "",
  color: getCategorySwatchColor("personal"),
  frequency_type: "recurring",
  recurrence_interval: "daily",
  target_count: "",
  milestone_names: [],
  start_date: toLocalDateString(),
  end_date: "",
  default_local_time: "",
  is_group: false,
};

export function GoalForm({ goalId }: GoalFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [state, setState] = useState<GoalFormState>(defaultState);
  const [selectedLinkTarget, setSelectedLinkTarget] = useState<string>("none");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [availableGoals, setAvailableGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [milestoneNamesOpen, setMilestoneNamesOpen] = useState(false);
  const [linkTargetSearch, setLinkTargetSearch] = useState("");
  const [linkTargetOpen, setLinkTargetOpen] = useState(false);

  const isEditing = Boolean(goalId);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setCurrentUserId(user.id);

      const [goalOptionsResponse, goalResponse, linksResponse, progress] =
        await Promise.all([
        supabase
          .from("goals")
          .select("*")
          .eq("owner_id", user.id)
          .eq("is_deleted", false)
          .order("title"),
        goalId
          ? supabase
              .from("goals")
              .select("*")
              .eq("id", goalId)
              .eq("is_deleted", false)
              .single()
          : Promise.resolve({ data: null, error: null } as const),
        goalId
          ? supabase
              .from("goal_links")
              .select("*")
              .eq("owner_id", user.id)
              .eq("source_goal_id", goalId)
          : Promise.resolve({ data: null, error: null } as const),
        fetchProgressContext({ asOfDate: toLocalDateString() }),
      ]);

      const goals = (goalOptionsResponse.data ?? []) as Goal[];
      const progressByGoal = progressSummaryMap(progress);
      // Achievement stops planner placement, but active goals remain linkable
      // so users can intentionally continue beyond a target.
      const linkableGoals = filterLinkableGoals(goals, progressByGoal, {
        excludeGoalId: goalId,
      });
      const linkableGoalIdSet = new Set(linkableGoals.map((goal) => goal.id));
      setAvailableGoals(linkableGoals);

      if (goalResponse.data) {
        const goal = goalResponse.data as Goal;
        const categoryState = getCategorySelectionFromValue(goal.category);
        setEditingGoal(goal);
        setState({
          title: goal.title,
          description: goal.description ?? "",
          category_selection: categoryState.selection,
          custom_category: categoryState.customValue,
          color: getCategorySwatchColor(categoryState.selection),
          frequency_type: goal.frequency_type,
          recurrence_interval: goal.recurrence_interval ?? "daily",
          target_count: goal.target_count?.toString() ?? "",
          milestone_names: buildMilestoneNameDrafts(
            goal.target_count ?? 0,
            goal.milestone_names ?? []
          ),
          start_date: goal.start_date,
          end_date: goal.end_date ?? "",
          default_local_time: goal.default_local_time ?? "",
          is_group: goal.is_group,
        });

        const existingLinks = (linksResponse.data ?? []) as GoalLink[];
        if (existingLinks.length > 0 && linkableGoalIdSet.has(existingLinks[0].target_goal_id)) {
          setSelectedLinkTarget(existingLinks[0].target_goal_id);
        } else {
          setSelectedLinkTarget("none");
        }

        if (goal.photo_path) {
          const { data: signedUrlData } = await supabase.storage
            .from("goal-photos")
            .createSignedUrl(goal.photo_path, 60 * 60);
          if (signedUrlData?.signedUrl) {
            setPhotoPreview(signedUrlData.signedUrl);
          }
        }
      }

      setLoading(false);
    };

    void load().catch((error: unknown) => {
      setLoading(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load linkable goals."
      );
    });
  }, [goalId, router, supabase]);

  const canShowRecurrenceFields = canShowRecurrenceFieldsForGoal(state.frequency_type);
  const canShowTargetCount = canShowTargetCountForGoal(state.frequency_type);
  const parsedTargetCount = parseGoalTargetCount(state.target_count, {
    requirePositive: true,
  });
  const definitionTargetCount = deriveDefinitionTargetCount({
    frequencyType: state.frequency_type,
    targetCountRaw: state.target_count,
    parsedTargetCount,
  });
  const requiresEndDate = requiresGoalEndDate(
    state.frequency_type,
    definitionTargetCount
  );
  const fixedMilestoneCount = getFixedMilestoneCount(
    state.frequency_type,
    parsedTargetCount
  );
  const filteredLinkTargets = useMemo(() => {
    return filterGoalsByLinkSearch(availableGoals, linkTargetSearch);
  }, [availableGoals, linkTargetSearch]);

  const updateFrequencyType = (nextFrequency: GoalFrequencyType) => {
    setMilestoneNamesOpen(false);
    setState((previous) => applyFrequencyTypeChange(previous, nextFrequency));
  };

  const updateTargetCount = (nextTargetCount: string) => {
    setState((previous) => applyTargetCountChange(previous, nextTargetCount));
  };

  const applyThisMonthEndDate = () => {
    setState((previous) => ({
      ...previous,
      end_date: getThisMonthEndDate(),
    }));
  };

  const applyThisMonthStartDate = () => {
    setState((previous) => ({
      ...previous,
      start_date: getThisMonthStartDate(),
    }));
  };

  const applyThisYearStartDate = () => {
    setState((previous) => ({
      ...previous,
      start_date: getThisYearStartDate(),
    }));
  };

  const applyThisYearEndDate = () => {
    setState((previous) => ({
      ...previous,
      end_date: getThisYearEndDate(),
    }));
  };

  const validationError = useMemo(
    () =>
      getFirstGoalFormValidationError(
        {
          ...state,
          linked_target_goal_id: selectedLinkTarget,
        },
        { requireRecurrenceInterval: true, requireStartDate: true }
      ),
    [selectedLinkTarget, state]
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    const payload = buildGoalRowPayload(state, {
      ownerId: currentUserId,
    });

    const savedGoalId = goalId ?? crypto.randomUUID();

    if (goalId) {
      const { error } = await supabase
        .from("goals")
        .update(payload)
        .eq("id", goalId)
        .eq("owner_id", currentUserId);

      if (error) {
        toast.error(error.message ?? "Failed to save goal.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("goals").insert({
        id: savedGoalId,
        ...payload,
      });

      if (error) {
        toast.error(error.message ?? "Failed to save goal.");
        setSaving(false);
        return;
      }
    }

    if (photoFile) {
      const fileName = `${Date.now()}-${photoFile.name.replace(/\s+/g, "-")}`;
      const objectPath = `${currentUserId}/${savedGoalId}/${fileName}`;
      const uploadResponse = await supabase.storage
        .from("goal-photos")
        .upload(objectPath, photoFile, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadResponse.error) {
        toast.error(uploadResponse.error.message);
      } else {
        await supabase
          .from("goals")
          .update({ photo_path: objectPath })
          .eq("id", savedGoalId)
          .eq("owner_id", currentUserId);
      }
    }

    await supabase
      .from("goal_links")
      .delete()
      .eq("owner_id", currentUserId)
      .eq("source_goal_id", savedGoalId);

    if (selectedLinkTarget !== "none") {
      const { error: linkError } = await supabase.from("goal_links").insert({
        owner_id: currentUserId,
        source_goal_id: savedGoalId,
        target_goal_id: selectedLinkTarget,
      });
      if (linkError) {
        toast.error(linkError.message);
      }
    }

    toast.success(isEditing ? "Goal updated." : "Goal created.");
    router.replace(state.is_group ? "/settings" : "/");
    router.refresh();
    setSaving(false);
  };

  const toggleArchive = async (archived: boolean) => {
    if (!goalId) {
      return;
    }
    setSaving(true);

    const { error } = await supabase
      .from("goals")
      .update({ archived_at: archived ? null : new Date().toISOString() })
      .eq("id", goalId)
      .eq("owner_id", currentUserId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(archived ? "Goal restored to active." : "Goal archived.");
      router.refresh();
    }

    setSaving(false);
  };

  const softDeleteGoal = async () => {
    if (!goalId) {
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("goals")
      .update({ is_deleted: true })
      .eq("id", goalId)
      .eq("owner_id", currentUserId);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success("Goal deleted.");
    router.replace(state.is_group ? "/settings" : "/");
    router.refresh();
    setSaving(false);
  };

  if (loading) {
    return (
      <GoalsSurfaceLoadingCard
        title="Loading goal form..."
        description="Preparing your editing workspace."
      />
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{isEditing ? "Edit goal" : "Create goal"}</CardTitle>
            <CardDescription>
              Configure goal type, timing, and optional links between goals.
            </CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link href={state.is_group ? "/settings" : "/"}>
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={state.title}
              onChange={(event) => setState((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Run 20 times by Dec 31"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={state.category_selection}
              onValueChange={(value: CategorySelection) =>
                setState((prev) => ({
                  ...prev,
                  category_selection: value,
                  color: getCategorySwatchColor(value),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
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

          {state.category_selection === "custom" ? (
            <div className="space-y-2">
              <Label htmlFor="custom-category">Custom category label</Label>
              <Input
                id="custom-category"
                value={state.custom_category}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, custom_category: event.target.value }))
                }
                placeholder="Your custom category"
                required
              />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Goal type</Label>
              <div className="flex flex-wrap gap-2">
                {GOAL_TYPE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={state.frequency_type === option.value ? "secondary" : "outline"}
                    className="rounded-full"
                    onClick={() => updateFrequencyType(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {canShowRecurrenceFields ? (
              <div className="space-y-2">
                <Label>Recurrence interval</Label>
                <div className="flex flex-wrap gap-2">
                  {RECURRENCE_INTERVAL_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={state.recurrence_interval === option.value ? "secondary" : "outline"}
                      className="rounded-full"
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          recurrence_interval: option.value,
                        }))
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {canShowTargetCount ? (
              <div className="space-y-2">
                <Label htmlFor="target-count">
                  {state.frequency_type === "fixed_milestones"
                    ? "Target count"
                    : "Target completions (optional)"}
                </Label>
                <Input
                  id="target-count"
                  type="number"
                  min={state.frequency_type === "fixed_milestones" ? 1 : 0}
                  value={state.target_count}
                  onChange={(event) => updateTargetCount(event.target.value)}
                  required={state.frequency_type === "fixed_milestones"}
                />
                {state.frequency_type === "recurring" ? (
                  <p className="text-xs text-muted-foreground">
                    Optional: set a total due by the end date. Each date is
                    checked independently; target-total goals do not use
                    current-period or streak semantics.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {fixedMilestoneCount > 0 ? (
            <Collapsible
              open={fixedMilestoneCount > 0 ? milestoneNamesOpen : false}
              onOpenChange={setMilestoneNamesOpen}
            >
              <div className="rounded-xl border bg-muted/20">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm"
                  >
                    <span>Milestone names (optional)</span>
                    {milestoneNamesOpen ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-3 border-t px-3 py-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: fixedMilestoneCount }).map((_, index) => (
                        <Input
                          key={`milestone-name-${index + 1}`}
                          value={state.milestone_names[index] ?? ""}
                          onChange={(event) =>
                            setState((previous) =>
                              applyMilestoneNameChange(
                                previous,
                                index,
                                event.target.value
                              )
                            )
                          }
                          placeholder={defaultMilestoneName(index)}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave any field blank to use the default name.
                    </p>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="start-date">Start date</Label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={applyThisMonthStartDate}
                  >
                    this month
                  </button>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={applyThisYearStartDate}
                  >
                    this year
                  </button>
                </div>
              </div>
              <Input
                id="start-date"
                type="date"
                value={state.start_date}
                onChange={(event) => setState((prev) => ({ ...prev, start_date: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="end-date">
                  {requiresEndDate ? "End date" : "End date (optional)"}
                </Label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={applyThisMonthEndDate}
                  >
                    this month
                  </button>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={applyThisYearEndDate}
                  >
                    this year
                  </button>
                </div>
              </div>
              <Input
                id="end-date"
                type="date"
                value={state.end_date}
                onChange={(event) => setState((prev) => ({ ...prev, end_date: event.target.value }))}
                  required={requiresEndDate}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="default-local-time">Default time of day (optional)</Label>
              {state.default_local_time ? (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    setState((previous) => ({ ...previous, default_local_time: "" }))
                  }
                >
                  clear
                </button>
              ) : null}
            </div>
            <Input
              id="default-local-time"
              type="time"
              value={state.default_local_time}
              onChange={(event) =>
                setState((previous) => ({
                  ...previous,
                  default_local_time: event.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Used as the default planner time when an item-level override is not set.
            </p>
          </div>

          {validationError ? (
            <p className="text-sm text-destructive">{validationError}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isEditing ? "Save changes" : "Create goal"}
            </Button>
            {isEditing && editingGoal?.archived_at ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => toggleArchive(true)}
              >
                <Undo2 className="size-4" />
                Restore goal
              </Button>
            ) : null}
            {isEditing && !editingGoal?.archived_at ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => toggleArchive(false)}
              >
                <Archive className="size-4" />
                Archive goal
              </Button>
            ) : null}
            {isEditing ? (
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={softDeleteGoal}
              >
                <Trash2 className="size-4" />
                Delete goal
              </Button>
            ) : null}
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <div className="rounded-xl border bg-muted/20">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm"
                >
                  <span>Advanced settings</span>
                  {advancedOpen ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-4 border-t px-3 py-3">
                  <div className="space-y-2">
                    <Label htmlFor="goal-description">Description</Label>
                    <Textarea
                      id="goal-description"
                      value={state.description}
                      onChange={(event) =>
                        setState((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Why this goal matters"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goal-color">Color accent</Label>
                    <Input
                      id="goal-color"
                      type="color"
                      value={state.color}
                      onChange={(event) =>
                        setState((prev) => ({ ...prev, color: event.target.value }))
                      }
                      className="h-10 p-1"
                    />
                    <p className="text-xs text-muted-foreground">
                      Auto-set from category selection. You can still override it here.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goal-photo">Photo (optional)</Label>
                    <Input
                      id="goal-photo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
                    />
                    {photoPreview ? (
                      <Image
                        src={photoPreview}
                        alt="Goal preview"
                        width={112}
                        height={112}
                        unoptimized
                        className="h-28 w-28 rounded-xl object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="rounded-xl border bg-background/70 p-3">
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={state.is_group}
                        onChange={(event) =>
                          setState((prev) => ({ ...prev, is_group: event.target.checked }))
                        }
                      />
                      <span>
                        This is a collaborative group goal (participants track their own completions).
                      </span>
                    </label>
                  </div>

                  {!state.is_group ? (
                    <div className="space-y-2">
                      <Label className="inline-flex items-center gap-2">
                        <Link2 className="size-4 text-muted-foreground" />
                        Link this goal to another goal (optional)
                      </Label>
                      <Select
                        value={selectedLinkTarget}
                        onValueChange={setSelectedLinkTarget}
                        open={linkTargetOpen}
                        onOpenChange={(open) => {
                          setLinkTargetOpen(open);
                          if (!open) {
                            setLinkTargetSearch("");
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="No linked target" />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="sticky top-0 z-10 border-b bg-popover p-1.5">
                            <Input
                              value={linkTargetSearch}
                              onChange={(event) => setLinkTargetSearch(event.target.value)}
                              placeholder="Search link targets..."
                              className="h-8"
                              onKeyDown={(event) => event.stopPropagation()}
                            />
                          </div>
                          <SelectItem value="none">No linked target</SelectItem>
                          {filteredLinkTargets.map((goal) => (
                            <SelectItem key={goal.id} value={goal.id}>
                              <span className="flex items-center gap-2">
                                <span className="max-w-[170px] truncate">{goal.title}</span>
                                <Badge variant="secondary">{getLinkedGoalRecurrenceLabel(goal)}</Badge>
                                <Badge variant="outline">{getLinkedGoalDeadlineLabel(goal)}</Badge>
                              </span>
                            </SelectItem>
                          ))}
                          {filteredLinkTargets.length === 0 ? (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                              No goals match your search.
                            </p>
                          ) : null}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Marking this goal complete will auto-complete linked goals for the same day.
                      </p>
                    </div>
                  ) : null}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </form>
      </CardContent>
    </Card>
  );
}
