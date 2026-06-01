"use client";

import { ArrowLeft, Archive, Link2, LoaderCircle, Save, Undo2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Goal, GoalFrequencyType, GoalLink, RecurrenceInterval } from "@/lib/goals/types";
import { createClient } from "@/lib/supabase/client";

interface GoalFormProps {
  goalId?: string;
}

interface GoalFormState {
  title: string;
  description: string;
  category: string;
  color: string;
  frequency_type: GoalFrequencyType;
  recurrence_interval: RecurrenceInterval;
  target_count: string;
  start_date: string;
  end_date: string;
  is_group: boolean;
}

const defaultState: GoalFormState = {
  title: "",
  description: "",
  category: "general",
  color: "#4f46e5",
  frequency_type: "recurring",
  recurrence_interval: "daily",
  target_count: "",
  start_date: toLocalDateString(),
  end_date: "",
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

      const [goalOptionsResponse, goalResponse, linksResponse] = await Promise.all([
        supabase.from("goals").select("*").eq("owner_id", user.id).order("title"),
        goalId
          ? supabase
              .from("goals")
              .select("*")
              .eq("id", goalId)
              .single()
          : Promise.resolve({ data: null, error: null } as const),
        goalId
          ? supabase
              .from("goal_links")
              .select("*")
              .eq("owner_id", user.id)
              .eq("source_goal_id", goalId)
          : Promise.resolve({ data: null, error: null } as const),
      ]);

      const goals = (goalOptionsResponse.data ?? []) as Goal[];
      setAvailableGoals(
        goals.filter((goal) => goal.id !== goalId && !goal.is_group)
      );

      if (goalResponse.data) {
        const goal = goalResponse.data as Goal;
        setEditingGoal(goal);
        setState({
          title: goal.title,
          description: goal.description ?? "",
          category: goal.category,
          color: goal.color ?? "#4f46e5",
          frequency_type: goal.frequency_type,
          recurrence_interval: goal.recurrence_interval ?? "daily",
          target_count: goal.target_count?.toString() ?? "",
          start_date: goal.start_date,
          end_date: goal.end_date ?? "",
          is_group: goal.is_group,
        });

        const existingLinks = (linksResponse.data ?? []) as GoalLink[];
        if (existingLinks.length > 0) {
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

    load();
  }, [goalId, router, supabase]);

  const canShowRecurrenceFields = state.frequency_type === "recurring";
  const canShowTargetCount = state.frequency_type === "fixed_milestones";

  const validationError = useMemo(() => {
    if (!state.title.trim()) {
      return "Title is required.";
    }

    if (state.frequency_type === "recurring" && !state.recurrence_interval) {
      return "Recurring goals require a recurrence interval.";
    }

    if (
      state.frequency_type === "fixed_milestones" &&
      (!state.target_count || Number.parseInt(state.target_count, 10) <= 0)
    ) {
      return "Fixed milestone goals require a positive target count.";
    }

    if (state.frequency_type === "fixed_milestones" && !state.end_date) {
      return "Fixed milestone goals require an end date.";
    }

    if (state.end_date && state.end_date < state.start_date) {
      return "End date cannot be before start date.";
    }

    return null;
  }, [state]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);

    const payload = {
      owner_id: currentUserId,
      title: state.title.trim(),
      description: state.description.trim() || null,
      category: state.category.trim() || "general",
      color: state.color,
      frequency_type: state.frequency_type,
      recurrence_interval: state.frequency_type === "recurring" ? state.recurrence_interval : null,
      target_count:
        state.frequency_type === "fixed_milestones"
          ? Number.parseInt(state.target_count, 10)
          : null,
      start_date: state.start_date,
      end_date: state.end_date || null,
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
    router.replace(state.is_group ? "/social" : "/");
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading goal form...</CardTitle>
          <CardDescription>Preparing your editing workspace.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{isEditing ? "Edit goal" : "Create goal"}</CardTitle>
            <CardDescription>
              Configure frequency, timing, and optional links between goals.
            </CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link href={state.is_group ? "/social" : "/"}>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="goal-category">Category</Label>
              <Input
                id="goal-category"
                value={state.category}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, category: event.target.value }))
                }
                placeholder="fitness"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-color">Color accent</Label>
              <Input
                id="goal-color"
                type="color"
                value={state.color}
                onChange={(event) => setState((prev) => ({ ...prev, color: event.target.value }))}
                className="h-10 p-1"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Frequency type</Label>
              <Select
                value={state.frequency_type}
                onValueChange={(value: GoalFrequencyType) =>
                  setState((prev) => ({ ...prev, frequency_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select goal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One time</SelectItem>
                  <SelectItem value="fixed_milestones">Fixed milestones</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {canShowRecurrenceFields ? (
              <div className="space-y-2">
                <Label>Recurrence interval</Label>
                <Select
                  value={state.recurrence_interval}
                  onValueChange={(value: RecurrenceInterval) =>
                    setState((prev) => ({ ...prev, recurrence_interval: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select interval" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {canShowTargetCount ? (
              <div className="space-y-2">
                <Label htmlFor="target-count">Target count</Label>
                <Input
                  id="target-count"
                  type="number"
                  min={1}
                  value={state.target_count}
                  onChange={(event) =>
                    setState((prev) => ({ ...prev, target_count: event.target.value }))
                  }
                  required={canShowTargetCount}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start date</Label>
              <Input
                id="start-date"
                type="date"
                value={state.start_date}
                onChange={(event) => setState((prev) => ({ ...prev, start_date: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End date (optional)</Label>
              <Input
                id="end-date"
                type="date"
                value={state.end_date}
                onChange={(event) => setState((prev) => ({ ...prev, end_date: event.target.value }))}
              />
            </div>
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

          {!state.is_group ? (
            <div className="space-y-2">
              <Label className="inline-flex items-center gap-2">
                <Link2 className="size-4 text-muted-foreground" />
                Link this goal to another goal (optional)
              </Label>
              <Select value={selectedLinkTarget} onValueChange={setSelectedLinkTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="No linked target" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked target</SelectItem>
                  {availableGoals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Marking this goal complete will auto-complete linked goals for the same day.
              </p>
            </div>
          ) : null}

          <div className="rounded-xl border bg-muted/40 p-3">
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
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
