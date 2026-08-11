"use client";

import {
  ArrowLeft,
  Archive,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear } from "date-fns";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingCard } from "@/components/ui/loading-card";
import { Textarea } from "@/components/ui/textarea";
import {
  CategorySelect,
  GoalTypeToggle,
  RecurrenceIntervalToggle,
  TargetCountField,
} from "@/features/goals/goal-field-kit";
import { GoalLinkTargetSelect } from "@/features/goals/goal-link-target-select";
import { MilestoneNameFields } from "@/features/goals/milestone-name-fields";
import { buildLoginHref } from "@/lib/auth/login-redirect";
import {
  GoalDateRangeFields,
  GoalDefaultTimeField,
} from "@/features/goals/goal-schedule-fields";
import { toLocalDateString } from "@/lib/dates/day";
import {
  type CategorySelection,
  getCategoryLabel,
  getCategorySelectionFromValue,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import {
  fetchProgressContext,
  progressSummaryMap,
} from "@/lib/goals/progress-context";
import {
  getLinkedGoalDeadlineLabel,
  getLinkedGoalRecurrenceLabel,
} from "@/lib/goals/linked-goal-labels";
import {
  buildMilestoneNameDrafts,
  normalizeMilestoneNamesForSave,
} from "@/lib/goals/milestones";
import type { Goal, GoalFrequencyType, GoalLink, RecurrenceInterval } from "@/lib/goals/types";
import {
  isOrdinalGoalDefinition,
  validateGoalDefinition,
} from "@/lib/goals/definition-validation";
import { createClient } from "@/lib/supabase/client";

interface GoalFormProps {
  goalId?: string;
  showBackButton?: boolean;
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

const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function parsePositiveTargetCount(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function GoalForm({ goalId, showBackButton = true }: GoalFormProps) {
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
        const nextPath = `${window.location.pathname}${window.location.search}`;
        router.replace(buildLoginHref(nextPath));
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
      const linkableGoals = goals.filter(
        (goal) =>
          goal.id !== goalId &&
          !goal.is_group &&
          progressByGoal.get(goal.id)?.lifecycle === "active"
      );
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

  const canShowRecurrenceFields = state.frequency_type === "recurring";
  const canShowTargetCount =
    state.frequency_type === "fixed_milestones" || state.frequency_type === "recurring";
  const parsedTargetCount = parsePositiveTargetCount(state.target_count);
  const definitionTargetCount =
    state.frequency_type === "fixed_milestones"
      ? parsedTargetCount
      : state.target_count.trim().length > 0
        ? parsedTargetCount
        : null;
  const requiresEndDate = isOrdinalGoalDefinition({
    frequencyType: state.frequency_type,
    targetCount: definitionTargetCount,
  });
  const fixedMilestoneCount =
    state.frequency_type === "fixed_milestones"
      ? parsedTargetCount ?? 0
      : 0;
  const filteredLinkTargets = useMemo(() => {
    const query = linkTargetSearch.trim().toLowerCase();
    if (query.length === 0) {
      return availableGoals;
    }

    return availableGoals.filter((goal) => {
      const recurrenceLabel = getLinkedGoalRecurrenceLabel(goal).toLowerCase();
      const deadlineLabel = getLinkedGoalDeadlineLabel(goal).toLowerCase();
      return (
        goal.title.toLowerCase().includes(query) ||
        recurrenceLabel.includes(query) ||
        deadlineLabel.includes(query)
      );
    });
  }, [availableGoals, linkTargetSearch]);

  const updateFrequencyType = (nextFrequency: GoalFrequencyType) => {
    setMilestoneNamesOpen(false);
    setState((previous) => ({
      ...previous,
      frequency_type: nextFrequency,
      target_count:
        nextFrequency === "fixed_milestones" && previous.target_count.trim().length === 0
          ? "3"
          : previous.target_count,
      milestone_names:
        nextFrequency === "fixed_milestones"
          ? buildMilestoneNameDrafts(
              parsePositiveTargetCount(
                nextFrequency === "fixed_milestones" && previous.target_count.trim().length === 0
                  ? "3"
                  : previous.target_count
              ) ?? 0,
              previous.milestone_names
            )
          : previous.milestone_names,
    }));
  };

  const updateTargetCount = (nextTargetCount: string) => {
    setState((previous) => ({
      ...previous,
      target_count: nextTargetCount,
      milestone_names:
        previous.frequency_type === "fixed_milestones"
          ? buildMilestoneNameDrafts(
              parsePositiveTargetCount(nextTargetCount) ?? 0,
              previous.milestone_names
            )
          : previous.milestone_names,
    }));
  };

  const applyThisMonthEndDate = () => {
    setState((previous) => ({
      ...previous,
      end_date: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    }));
  };

  const applyThisMonthStartDate = () => {
    setState((previous) => ({
      ...previous,
      start_date: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    }));
  };

  const applyThisYearStartDate = () => {
    setState((previous) => ({
      ...previous,
      start_date: format(startOfYear(new Date()), "yyyy-MM-dd"),
    }));
  };

  const applyThisYearEndDate = () => {
    setState((previous) => ({
      ...previous,
      end_date: format(endOfYear(new Date()), "yyyy-MM-dd"),
    }));
  };

  const validationError = useMemo(() => {
    if (!state.title.trim()) {
      return "Title is required.";
    }

    if (state.frequency_type === "recurring" && !state.recurrence_interval) {
      return "Repeat goals require a recurrence interval.";
    }

    if (
      state.frequency_type === "fixed_milestones" &&
      parsedTargetCount === null
    ) {
      return "Milestone goals require a positive target count.";
    }

    if (
      state.default_local_time.trim().length > 0 &&
      !localTimePattern.test(state.default_local_time.trim())
    ) {
      return "Default time must be a valid 24-hour HH:MM value.";
    }

    if (
      state.category_selection === "custom" &&
      state.custom_category.trim().length === 0
    ) {
      return "Custom category name is required.";
    }

    const definitionErrors = validateGoalDefinition({
      frequencyType: state.frequency_type,
      targetCount: definitionTargetCount,
      startDate: state.start_date,
      endDate: state.end_date || null,
    });
    if (definitionErrors.length > 0) {
      return definitionErrors[0]!.message;
    }

    return null;
  }, [state, parsedTargetCount, definitionTargetCount]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    const parsedTargetCountForSave = parsePositiveTargetCount(state.target_count);
    const milestoneNames =
      state.frequency_type === "fixed_milestones" && parsedTargetCountForSave !== null
        ? normalizeMilestoneNamesForSave(parsedTargetCountForSave, state.milestone_names)
        : null;

    const payload = {
      owner_id: currentUserId,
      title: state.title.trim(),
      description: state.description.trim() || null,
      category: getCategoryLabel(state.category_selection, state.custom_category),
      color: state.color,
      frequency_type: state.frequency_type,
      recurrence_interval: state.frequency_type === "recurring" ? state.recurrence_interval : null,
      target_count:
        state.frequency_type === "fixed_milestones"
          ? parsedTargetCountForSave
          : state.frequency_type === "recurring" && state.target_count.trim().length > 0
            ? parsedTargetCountForSave
          : null,
      milestone_names: milestoneNames,
      start_date: state.start_date,
      end_date: state.end_date || null,
      default_local_time: state.default_local_time.trim() || null,
      is_group: state.is_group,
    };

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
      <LoadingCard
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
          {showBackButton ? (
            <Button variant="outline" asChild>
              <Link href={state.is_group ? "/settings" : "/"}>
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          ) : null}
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
            <CategorySelect
              value={state.category_selection}
              onValueChange={(value: CategorySelection) =>
                setState((prev) => ({
                  ...prev,
                  category_selection: value,
                  color: getCategorySwatchColor(value),
                }))
              }
            />
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
              <GoalTypeToggle
                value={state.frequency_type}
                onValueChange={updateFrequencyType}
              />
            </div>

            {canShowRecurrenceFields ? (
              <div className="space-y-2">
                <Label>Recurrence interval</Label>
                <RecurrenceIntervalToggle
                  value={state.recurrence_interval}
                  onValueChange={(value) =>
                    setState((prev) => ({
                      ...prev,
                      recurrence_interval: value,
                    }))
                  }
                />
              </div>
            ) : null}

            {canShowTargetCount ? (
              <div className="space-y-2">
                <Label htmlFor="target-count">
                  {state.frequency_type === "fixed_milestones"
                    ? "Target count"
                    : "Target completions (optional)"}
                </Label>
                <TargetCountField
                  id="target-count"
                  frequencyType={state.frequency_type}
                  value={state.target_count}
                  onValueChange={updateTargetCount}
                />
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
                    <MilestoneNameFields
                      count={fixedMilestoneCount}
                      values={state.milestone_names}
                      onValueChange={(index, value) =>
                        setState((previous) => {
                          const nextMilestoneNames = [...previous.milestone_names];
                          nextMilestoneNames[index] = value;
                          return {
                            ...previous,
                            milestone_names: nextMilestoneNames,
                          };
                        })
                      }
                      showLabel={false}
                      keyPrefix="milestone-name"
                    />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ) : null}

          <GoalDateRangeFields
            startDate={state.start_date}
            endDate={state.end_date}
            onStartDateChange={(value) =>
              setState((previous) => ({ ...previous, start_date: value }))
            }
            onEndDateChange={(value) =>
              setState((previous) => ({ ...previous, end_date: value }))
            }
            requiresEndDate={requiresEndDate}
            startDateId="start-date"
            endDateId="end-date"
            startDateActions={
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
            }
            endDateActions={
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
            }
          />

          <GoalDefaultTimeField
            id="default-local-time"
            value={state.default_local_time}
            onValueChange={(value) =>
              setState((previous) => ({
                ...previous,
                default_local_time: value,
              }))
            }
            onClear={() => setState((previous) => ({ ...previous, default_local_time: "" }))}
          />

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
                    <GoalLinkTargetSelect
                      value={selectedLinkTarget}
                      onValueChange={setSelectedLinkTarget}
                      open={linkTargetOpen}
                      onOpenChange={(open) => {
                        setLinkTargetOpen(open);
                        if (!open) {
                          setLinkTargetSearch("");
                        }
                      }}
                      searchQuery={linkTargetSearch}
                      onSearchQueryChange={setLinkTargetSearch}
                      filteredLinkTargets={filteredLinkTargets}
                    />
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
