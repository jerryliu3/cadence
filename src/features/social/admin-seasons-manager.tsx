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
  LeaderboardRollover,
  LeaderboardSeasonStatus,
  SocialSubjectKind,
} from "@/features/social/types";

interface SeasonRow {
  id: string;
  slug: string;
  title: string;
  status: "upcoming" | "open" | "closed";
  metric: string;
  subject_kind: "user" | "team";
  metric_track_key: string | null;
  rollover: "none" | "weekly" | "monthly" | "quarterly" | "yearly";
  scope: "global" | "cohort";
  cohort_id: string | null;
  starts_at: string;
  ends_at: string | null;
}

interface AdminMetadataResponse {
  schemaVersion: "1";
  goalCategories?: Array<{ key: string; label: string }>;
  cohorts?: Array<{ id: string; slug: string; title: string; isActive: boolean }>;
}

interface SeasonFormState {
  slug: string;
  title: string;
  subjectKind: SocialSubjectKind;
  metric: ChallengeMetric;
  metricTrackKey: string;
  startsAt: string;
  endsAt: string;
  status: LeaderboardSeasonStatus;
  rollover: LeaderboardRollover;
  scope: "global" | "cohort";
  cohortId: string;
}

const NONE_VALUE = "__none__";
const STATUS_OPTIONS: LeaderboardSeasonStatus[] = ["upcoming", "open", "closed"];
const ROLLOVER_OPTIONS: LeaderboardRollover[] = ["none", "weekly", "monthly", "quarterly", "yearly"];
const SUBJECT_KIND_OPTIONS: SocialSubjectKind[] = ["user", "team"];
const METRIC_OPTIONS: ChallengeMetric[] = [
  "total_xp",
  "category_xp",
  "completions_count",
  "distinct_active_days",
  "max_streak_days",
];
const SCOPE_OPTIONS: Array<"global" | "cohort"> = ["global", "cohort"];

function readJsonErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

function toLocalDateTimeInput(isoValue: string | null): string {
  if (!isoValue) {
    return "";
  }
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

function buildDefaultForm(): SeasonFormState {
  const now = new Date();
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    slug: "",
    title: "",
    subjectKind: "user",
    metric: "completions_count",
    metricTrackKey: "",
    startsAt: toLocalDateTimeInput(now.toISOString()),
    endsAt: toLocalDateTimeInput(endsAt.toISOString()),
    status: "upcoming",
    rollover: "none",
    scope: "global",
    cohortId: "",
  };
}

function toFormState(season: SeasonRow): SeasonFormState {
  return {
    slug: season.slug,
    title: season.title,
    subjectKind: season.subject_kind,
    metric: season.metric as ChallengeMetric,
    metricTrackKey: season.metric_track_key ?? "",
    startsAt: toLocalDateTimeInput(season.starts_at),
    endsAt: toLocalDateTimeInput(season.ends_at),
    status: season.status,
    rollover: season.rollover,
    scope: season.scope,
    cohortId: season.cohort_id ?? "",
  };
}

function buildPayload(form: SeasonFormState): { payload: Record<string, unknown> } | { error: string } {
  const slug = form.slug.trim();
  const title = form.title.trim();
  const startsAt = toIso(form.startsAt);
  const endsAt = toIso(form.endsAt);
  const metricTrackKey = form.metric === "category_xp" ? form.metricTrackKey.trim() : null;
  const cohortId = form.scope === "cohort" ? form.cohortId.trim() : null;

  if (slug.length < 2) return { error: "Slug must be at least 2 characters." };
  if (title.length === 0) return { error: "Title is required." };
  if (!startsAt) return { error: "Start time is required." };
  if (form.metric === "category_xp" && (!metricTrackKey || metricTrackKey.length === 0)) {
    return { error: "Metric track is required for category_xp metrics." };
  }
  if (form.scope === "cohort" && (!cohortId || cohortId.length === 0)) {
    return { error: "Group is required for group-scoped seasons." };
  }

  return {
    payload: {
      slug,
      title,
      subjectKind: form.subjectKind,
      metric: form.metric,
      metricTrackKey,
      startsAt,
      endsAt,
      status: form.status,
      rollover: form.rollover,
      scope: form.scope,
      cohortId,
    },
  };
}

export function AdminSeasonsManager() {
  const [items, setItems] = useState<SeasonRow[]>([]);
  const [goalCategories, setGoalCategories] = useState<Array<{ key: string; label: string }>>([]);
  const [cohorts, setCohorts] = useState<Array<{ id: string; slug: string; title: string; isActive: boolean }>>(
    []
  );
  const [createForm, setCreateForm] = useState<SeasonFormState>(() => buildDefaultForm());
  const [editForms, setEditForms] = useState<Record<string, SeasonFormState>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);

  const cohortOptions = useMemo(() => cohorts, [cohorts]);
  const load = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    try {
      const [seasonsResponse, metadataResponse] = await Promise.all([
        fetch("/api/admin/seasons", {
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/admin/social-metadata", {
          cache: "no-store",
          credentials: "include",
        }),
      ]);
      if (!seasonsResponse.ok) {
        const payload = await seasonsResponse.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not load seasons."));
      }
      if (!metadataResponse.ok) {
        const payload = await metadataResponse.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not load dropdown metadata."));
      }

      const seasonsPayload = (await seasonsResponse.json()) as { items?: SeasonRow[] };
      const metadataPayload = (await metadataResponse.json()) as AdminMetadataResponse;
      const nextItems = seasonsPayload.items ?? [];

      setItems(nextItems);
      setGoalCategories(metadataPayload.goalCategories ?? []);
      setCohorts(metadataPayload.cohorts ?? []);
      setEditForms(
        nextItems.reduce<Record<string, SeasonFormState>>((accumulator, season) => {
          accumulator[season.id] = toFormState(season);
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
        setError(loadError instanceof Error ? loadError.message : "Could not load seasons.");
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function createSeason() {
    const built = buildPayload(createForm);
    if ("error" in built) {
      setError(built.error);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsCreating(true);
    try {
      const response = await fetch("/api/admin/seasons", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(built.payload),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not create season."));
      }
      setCreateForm(buildDefaultForm());
      await load();
      setSuccess("Season created.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create season.");
    } finally {
      setIsCreating(false);
    }
  }

  async function saveSeason(id: string) {
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
      const response = await fetch(`/api/admin/seasons/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(built.payload),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not update season."));
      }
      await load();
      setSuccess("Season updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update season.");
    } finally {
      setRowActionId(null);
    }
  }

  async function closeSeason(id: string) {
    setError(null);
    setSuccess(null);
    setRowActionId(id);
    try {
      const response = await fetch(`/api/admin/seasons/${id}/close`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not close season."));
      }
      await load();
      setSuccess("Season closed.");
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Could not close season.");
    } finally {
      setRowActionId(null);
    }
  }

  async function deleteSeason(id: string) {
    const season = items.find((item) => item.id === id);
    if (!season) {
      return;
    }
    const shouldDelete = window.confirm(`Hard delete season "${season.title}"?`);
    if (!shouldDelete) {
      return;
    }

    setError(null);
    setSuccess(null);
    setRowActionId(id);
    try {
      const response = await fetch(`/api/admin/seasons/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(readJsonErrorMessage(payload, "Could not delete season."));
      }
      await load();
      setSuccess("Season deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete season.");
    } finally {
      setRowActionId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Create season</CardTitle>
          <CardDescription>Create and configure a leaderboard season row from admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">Title</p>
              <Input
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Slug</p>
              <Input
                value={createForm.slug}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, slug: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Status</p>
              <Select
                value={createForm.status}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    status: value as LeaderboardSeasonStatus,
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
                value={createForm.subjectKind}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    subjectKind: value as SocialSubjectKind,
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
              <p className="text-xs font-medium">Rollover</p>
              <Select
                value={createForm.rollover}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    rollover: value as LeaderboardRollover,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLLOVER_OPTIONS.map((rollover) => (
                    <SelectItem key={rollover} value={rollover}>
                      {rollover}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Scope</p>
              <Select
                value={createForm.scope}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    scope: value as "global" | "cohort",
                    cohortId: value === "cohort" ? current.cohortId : "",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {scope}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Group</p>
              <Select
                value={createForm.cohortId || NONE_VALUE}
                onValueChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    cohortId: value === NONE_VALUE ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {cohortOptions.map((cohort) => (
                    <SelectItem key={cohort.id} value={cohort.id}>
                      {cohort.title} ({cohort.slug}){cohort.isActive ? "" : " [inactive]"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={isCreating || isLoading} onClick={() => void createSeason()}>
              {isCreating ? "Creating..." : "Create season"}
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
          <CardTitle>Existing seasons</CardTitle>
          <CardDescription>Edit season parameters, close active seasons, and hard delete rows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="text-muted-foreground">No seasons found.</p>
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
                      <p className="text-xs font-medium">Status</p>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], status: value as LeaderboardSeasonStatus },
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
                            [item.id]: { ...current[item.id], subjectKind: value as SocialSubjectKind },
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
                      <p className="text-xs font-medium">Rollover</p>
                      <Select
                        value={form.rollover}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: { ...current[item.id], rollover: value as LeaderboardRollover },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLLOVER_OPTIONS.map((rollover) => (
                            <SelectItem key={rollover} value={rollover}>
                              {rollover}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Scope</p>
                      <Select
                        value={form.scope}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              scope: value as "global" | "cohort",
                              cohortId: value === "cohort" ? current[item.id].cohortId : "",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPE_OPTIONS.map((scope) => (
                            <SelectItem key={scope} value={scope}>
                              {scope}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Group</p>
                      <Select
                        value={form.cohortId || NONE_VALUE}
                        onValueChange={(value) =>
                          setEditForms((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              cohortId: value === NONE_VALUE ? "" : value,
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>None</SelectItem>
                          {cohortOptions.map((cohort) => (
                            <SelectItem key={cohort.id} value={cohort.id}>
                              {cohort.title} ({cohort.slug}){cohort.isActive ? "" : " [inactive]"}
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
                      onClick={() => void saveSeason(item.id)}
                    >
                      {isRowPending ? "Saving..." : "Save changes"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isRowPending || form.status !== "open"}
                      onClick={() => void closeSeason(item.id)}
                    >
                      {isRowPending ? "Working..." : "Close season"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={isRowPending}
                      onClick={() => void deleteSeason(item.id)}
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
