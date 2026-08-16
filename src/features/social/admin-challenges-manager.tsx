"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ChallengeMetric,
  ChallengeStatus,
  SocialChallenge,
  SocialSubjectKind,
} from "@/features/social/types";

interface AdminChallengeResponse {
  schemaVersion: "1";
  items?: SocialChallenge[];
}

interface AdminMetadataResponse {
  schemaVersion: "1";
  goalCategories?: Array<{ key: string; label: string }>;
  groups?: Array<{ id: string; slug: string; title: string; isActive: boolean }>;
}

interface ChallengeFormState {
  slug: string;
  title: string;
  description: string;
  status: ChallengeStatus;
  subjectKind: SocialSubjectKind;
  metric: ChallengeMetric;
  metricTrackKey: string;
  targetValue: string;
  startsAt: string;
  endsAt: string;
  rewardXp: string;
  maxParticipants: string;
  audienceKind: "global" | "group";
  groupId: string;
}

const NONE_VALUE = "__none__";
const STATUS_OPTIONS: ChallengeStatus[] = ["draft", "scheduled", "active", "closed", "archived"];
const SUBJECT_KIND_OPTIONS: SocialSubjectKind[] = ["user", "team"];
const METRIC_OPTIONS: ChallengeMetric[] = [
  "total_xp",
  "category_xp",
  "completions_count",
  "distinct_active_days",
  "max_streak_days",
];
const AUDIENCE_OPTIONS: Array<"global" | "group"> = ["global", "group"];

function readJsonErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

function toLocalDateTimeInput(isoValue: string): string {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  const local = new Date(parsed.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function toIso(inputValue: string): string | null {
  if (inputValue.trim().length === 0) {
    return null;
  }
  const parsed = new Date(inputValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function buildDefaultForm(): ChallengeFormState {
  const now = new Date();
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    slug: "",
    title: "",
    description: "",
    status: "draft",
    subjectKind: "user",
    metric: "completions_count",
    metricTrackKey: "",
    targetValue: "5",
    startsAt: toLocalDateTimeInput(now.toISOString()),
    endsAt: toLocalDateTimeInput(endsAt.toISOString()),
    rewardXp: "0",
    maxParticipants: "",
    audienceKind: "global",
    groupId: "",
  };
}

function toFormState(challenge: SocialChallenge): ChallengeFormState {
  return {
    slug: challenge.slug,
    title: challenge.title,
    description: challenge.description ?? "",
    status: challenge.status,
    subjectKind: challenge.subjectKind,
    metric: challenge.metric,
    metricTrackKey: challenge.metricTrackKey ?? "",
    targetValue: String(challenge.targetValue),
    startsAt: toLocalDateTimeInput(challenge.startsAt),
    endsAt: toLocalDateTimeInput(challenge.endsAt),
    rewardXp: String(challenge.rewardXp),
    maxParticipants: challenge.maxParticipants == null ? "" : String(challenge.maxParticipants),
    audienceKind: challenge.audienceKind,
    groupId: challenge.groupId ?? "",
  };
}

function buildPayload(form: ChallengeFormState): { payload: Record<string, unknown> } | { error: string } {
  const slug = form.slug.trim();
  const title = form.title.trim();
  const description = form.description.trim();
  const startsAt = toIso(form.startsAt);
  const endsAt = toIso(form.endsAt);
  const targetValue = Number(form.targetValue);
  const rewardXp = Number(form.rewardXp);
  const maxParticipants =
    form.maxParticipants.trim().length === 0 ? null : Number(form.maxParticipants.trim());
  const metricTrackKey =
    form.metric === "category_xp" ? form.metricTrackKey.trim() : null;
  const groupId = form.audienceKind === "group" ? form.groupId.trim() : null;

  if (slug.length < 2) return { error: "Slug must be at least 2 characters." };
  if (title.length === 0) return { error: "Title is required." };
  if (!startsAt || !endsAt) return { error: "Start and end times are required." };
  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    return { error: "Target value must be greater than zero." };
  }
  if (!Number.isInteger(rewardXp) || rewardXp < 0) {
    return { error: "Reward XP must be a non-negative integer." };
  }
  if (
    maxParticipants !== null &&
    (!Number.isInteger(maxParticipants) || maxParticipants <= 0)
  ) {
    return { error: "Max participants must be a positive integer or blank." };
  }
  if (form.metric === "category_xp" && (!metricTrackKey || metricTrackKey.length === 0)) {
    return { error: "Metric track is required for category_xp metrics." };
  }
  if (form.audienceKind === "group" && (!groupId || groupId.length === 0)) {
    return { error: "Group is required for group-scoped challenges." };
  }

  return {
    payload: {
      slug,
      title,
      description: description.length === 0 ? null : description,
      status: form.status,
      subjectKind: form.subjectKind,
      metric: form.metric,
      metricTrackKey,
      targetValue,
      startsAt,
      endsAt,
      rewardXp,
      maxParticipants,
      audienceKind: form.audienceKind,
      groupId,
    },
  };
}

export function AdminChallengesManager() {
  const [items, setItems] = useState<SocialChallenge[]>([]);
  const [goalCategories, setGoalCategories] = useState<Array<{ key: string; label: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; slug: string; title: string; isActive: boolean }>>(
    []
  );
  const [createForm, setCreateForm] = useState<ChallengeFormState>(() => buildDefaultForm());
  const [editForms, setEditForms] = useState<Record<string, ChallengeFormState>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);

  const groupOptions = useMemo(() => groups, [groups]);

  const load = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    try {
      const [challengeResponse, metadataResponse] = await Promise.all([
        fetch("/api/admin/challenges", {
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/admin/social-metadata", {
          cache: "no-store",
          credentials: "include",
        }),
      ]);
      if (!challengeResponse.ok) {
        const payload = await challengeResponse.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not load admin challenges."));
      }
      if (!metadataResponse.ok) {
        const payload = await metadataResponse.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not load dropdown metadata."));
      }

      const challengePayload = (await challengeResponse.json()) as AdminChallengeResponse;
      const metadataPayload = (await metadataResponse.json()) as AdminMetadataResponse;
      const nextItems = challengePayload.items ?? [];

      setItems(nextItems);
      setGoalCategories(metadataPayload.goalCategories ?? []);
      setGroups(metadataPayload.groups ?? []);
      setEditForms(
        nextItems.reduce<Record<string, ChallengeFormState>>((accumulator, challenge) => {
          accumulator[challenge.id] = toFormState(challenge);
          return accumulator;
        }, {})
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load().catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load challenges.");
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function createChallenge() {
    const built = buildPayload(createForm);
    if ("error" in built) {
      setError(built.error);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsCreating(true);
    try {
      const response = await fetch("/api/admin/challenges", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(built.payload),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not create challenge."));
      }
      setCreateForm(buildDefaultForm());
      await load();
      setSuccess("Challenge created.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create challenge.");
    } finally {
      setIsCreating(false);
    }
  }

  async function saveChallenge(id: string) {
    const form = editForms[id];
    if (!form) {
      return;
    }
    const built = buildPayload(form);
    if ("error" in built) {
      setError(built.error);
      return;
    }

    setError(null);
    setSuccess(null);
    setRowActionId(id);
    try {
      const response = await fetch(`/api/admin/challenges/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(built.payload),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not update challenge."));
      }
      await load();
      setSuccess("Challenge updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update challenge.");
    } finally {
      setRowActionId(null);
    }
  }

  async function deleteChallenge(id: string) {
    const challenge = items.find((item) => item.id === id);
    if (!challenge) {
      return;
    }
    const shouldDelete = window.confirm(`Hard delete challenge "${challenge.title}"?`);
    if (!shouldDelete) {
      return;
    }

    setError(null);
    setSuccess(null);
    setRowActionId(id);
    try {
      const response = await fetch(`/api/admin/challenges/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not delete challenge."));
      }
      await load();
      setSuccess("Challenge deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete challenge.");
    } finally {
      setRowActionId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Create challenge</CardTitle>
          <CardDescription>Configure and launch challenge rows directly from admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">Title</p>
              <Input
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Challenge title"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Slug</p>
              <Input
                value={createForm.slug}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, slug: event.target.value }))
                }
                placeholder="challenge-slug"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Description</p>
              <Input
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Status</p>
              <Select
                value={createForm.status}
                onValueChange={(value) =>
                  setCreateForm((current) => ({ ...current, status: value as ChallengeStatus }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Subject kind</p>
              <Select
                value={createForm.subjectKind}
                onValueChange={(value) =>
                  setCreateForm((current) => ({ ...current, subjectKind: value as SocialSubjectKind }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECT_KIND_OPTIONS.map((subjectKind) => (
                    <SelectItem key={subjectKind} value={subjectKind}>
                      {subjectKind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Metric</p>
              <Select
                value={createForm.metric}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    metric: value as ChallengeMetric,
                    metricTrackKey: value === "category_xp" ? current.metricTrackKey : "",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((metric) => (
                    <SelectItem key={metric} value={metric}>
                      {metric}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Metric track</p>
              <Select
                value={createForm.metricTrackKey || NONE_VALUE}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    metricTrackKey: value === NONE_VALUE ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {goalCategories.map((category) => (
                    <SelectItem key={category.key} value={category.key}>
                      {category.label} ({category.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Target value</p>
              <Input
                value={createForm.targetValue}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, targetValue: event.target.value }))
                }
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Reward XP</p>
              <Input
                value={createForm.rewardXp}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, rewardXp: event.target.value }))
                }
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Max participants</p>
              <Input
                value={createForm.maxParticipants}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    maxParticipants: event.target.value,
                  }))
                }
                placeholder="blank = unlimited"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Starts at</p>
              <Input
                type="datetime-local"
                value={createForm.startsAt}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, startsAt: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Ends at</p>
              <Input
                type="datetime-local"
                value={createForm.endsAt}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, endsAt: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Audience</p>
              <Select
                value={createForm.audienceKind}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    audienceKind: value as "global" | "group",
                    groupId: value === "group" ? current.groupId : "",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((audience) => (
                    <SelectItem key={audience} value={audience}>
                      {audience}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Group</p>
              <Select
                value={createForm.groupId || NONE_VALUE}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    groupId: value === NONE_VALUE ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {groupOptions.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.title} ({group.slug}){group.isActive ? "" : " [inactive]"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={isCreating || isLoading} onClick={() => void createChallenge()}>
              {isCreating ? "Creating..." : "Create challenge"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isCreating}
              onClick={() => setCreateForm(buildDefaultForm())}
            >
              Reset
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Existing challenges</CardTitle>
          <CardDescription>Edit lifecycle, scoring, and visibility configuration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="text-muted-foreground">No challenges found.</p>
          ) : (
            items.map((item) => {
              const form = editForms[item.id];
              if (!form) {
                return null;
              }
              const isRowPending = rowActionId === item.id;
              return (
                <div key={item.id} className="space-y-3 rounded border p-3">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.slug} · {item.status} · {item.metric}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Title</p>
                      <Input
                        value={form.title}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], title: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Slug</p>
                      <Input
                        value={form.slug}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], slug: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Description</p>
                      <Input
                        value={form.description}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], description: event.target.value },
                          }))
                        }
                        placeholder="Optional description"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Status</p>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], status: value as ChallengeStatus },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Subject kind</p>
                      <Select
                        value={form.subjectKind}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              subjectKind: value as SocialSubjectKind,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBJECT_KIND_OPTIONS.map((subjectKind) => (
                            <SelectItem key={subjectKind} value={subjectKind}>
                              {subjectKind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Metric</p>
                      <Select
                        value={form.metric}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              metric: value as ChallengeMetric,
                              metricTrackKey:
                                value === "category_xp" ? current[item.id].metricTrackKey : "",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {METRIC_OPTIONS.map((metric) => (
                            <SelectItem key={metric} value={metric}>
                              {metric}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Metric track</p>
                      <Select
                        value={form.metricTrackKey || NONE_VALUE}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              metricTrackKey: value === NONE_VALUE ? "" : value,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>None</SelectItem>
                          {goalCategories.map((category) => (
                            <SelectItem key={category.key} value={category.key}>
                              {category.label} ({category.key})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Target value</p>
                      <Input
                        value={form.targetValue}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], targetValue: event.target.value },
                          }))
                        }
                        inputMode="numeric"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Reward XP</p>
                      <Input
                        value={form.rewardXp}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], rewardXp: event.target.value },
                          }))
                        }
                        inputMode="numeric"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Max participants</p>
                      <Input
                        value={form.maxParticipants}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              maxParticipants: event.target.value,
                            },
                          }))
                        }
                        placeholder="blank = unlimited"
                        inputMode="numeric"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Starts at</p>
                      <Input
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], startsAt: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Ends at</p>
                      <Input
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], endsAt: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Audience</p>
                      <Select
                        value={form.audienceKind}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              audienceKind: value as "global" | "group",
                              groupId: value === "group" ? current[item.id].groupId : "",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIENCE_OPTIONS.map((audience) => (
                            <SelectItem key={audience} value={audience}>
                              {audience}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Group</p>
                      <Select
                        value={form.groupId || NONE_VALUE}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              groupId: value === NONE_VALUE ? "" : value,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>None</SelectItem>
                          {groupOptions.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.title} ({group.slug}){group.isActive ? "" : " [inactive]"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isRowPending}
                      onClick={() => void saveChallenge(item.id)}
                    >
                      {isRowPending ? "Saving..." : "Save changes"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={isRowPending}
                      onClick={() => void deleteChallenge(item.id)}
                    >
                      {isRowPending ? "Working..." : "Hard delete"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
