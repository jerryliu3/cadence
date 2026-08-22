"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  filterAdminSyntheticUsers,
  SYNTHETIC_PERSONAS,
  type AdminSyntheticConfig,
  type AdminSyntheticUser,
  type SyntheticPersona,
} from "@/features/admin/synthetic-users";

interface ListResponse {
  schemaVersion: "1";
  items?: AdminSyntheticUser[];
  config?: AdminSyntheticConfig;
}

interface UserDraft {
  username: string;
  displayName: string;
  persona: SyntheticPersona;
  archetype: string;
  dailyBudget: string;
  enabled: boolean;
  socialActivityVisible: boolean;
}

function readJsonErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

function toDraft(user: AdminSyntheticUser): UserDraft {
  return {
    username: user.username,
    displayName: user.displayName ?? "",
    persona: user.persona,
    archetype: user.archetype,
    dailyBudget: String(user.dailyBudget),
    enabled: user.enabled,
    socialActivityVisible: user.socialActivityVisible,
  };
}

export function AdminSyntheticUsersManager() {
  const [items, setItems] = useState<AdminSyntheticUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [config, setConfig] = useState<AdminSyntheticConfig>({
    enabled: true,
    maxCompletionsPerTick: 8,
    maxReactionsPerTick: 12,
    throttleAboveRealDau: 50,
  });
  const [query, setQuery] = useState("");
  const [persona, setPersona] = useState<"all" | SyntheticPersona>("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "true" | "false">("all");
  const [targetCount, setTargetCount] = useState("10");
  const [goalsPerUser, setGoalsPerUser] = useState("6");
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterAdminSyntheticUsers(items, { query, persona, enabled: enabledFilter }),
    [enabledFilter, items, persona, query]
  );

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/synthetic-users", {
        cache: "no-store",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as ListResponse & {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(readJsonErrorMessage(payload, "Could not load synthetic users."));
      }
      const nextItems = payload.items ?? [];
      setItems(nextItems);
      setDrafts(
        nextItems.reduce<Record<string, UserDraft>>((accumulator, user) => {
          accumulator[user.userId] = toDraft(user);
          return accumulator;
        }, {})
      );
      if (payload.config) {
        setConfig(payload.config);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load synthetic users.");
    });
  }, [load]);

  function updateDraft(userId: string, patch: Partial<UserDraft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...patch,
      },
    }));
  }

  async function saveUser(userId: string) {
    const draft = drafts[userId];
    if (!draft) {
      return;
    }
    const dailyBudget = Number(draft.dailyBudget);
    if (!Number.isInteger(dailyBudget) || dailyBudget < 1 || dailyBudget > 12) {
      setError("Daily budget must be an integer between 1 and 12.");
      return;
    }
    setBusyKey(userId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/synthetic-users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: draft.username.trim(),
          displayName: draft.displayName.trim().length === 0 ? null : draft.displayName.trim(),
          persona: draft.persona,
          archetype: draft.archetype.trim(),
          dailyBudget,
          enabled: draft.enabled,
          socialActivityVisible: draft.socialActivityVisible,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readJsonErrorMessage(payload, "Could not update synthetic user."));
      }
      const item = (payload as { item?: AdminSyntheticUser }).item;
      if (item) {
        setItems((current) => current.map((row) => (row.userId === userId ? item : row)));
        updateDraft(userId, toDraft(item));
      }
      setSuccess(`Saved ${draft.username}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update synthetic user.");
    } finally {
      setBusyKey(null);
    }
  }

  async function disableUser(userId: string) {
    setBusyKey(userId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/synthetic-users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readJsonErrorMessage(payload, "Could not disable synthetic user."));
      }
      const item = (payload as { item?: AdminSyntheticUser }).item;
      if (item) {
        setItems((current) => current.map((row) => (row.userId === userId ? item : row)));
        updateDraft(userId, toDraft(item));
      }
      setSuccess("Synthetic user disabled.");
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : "Could not disable synthetic user.");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveConfig() {
    setBusyKey("config");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/synthetic-config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readJsonErrorMessage(payload, "Could not update synthetic config."));
      }
      const nextConfig = (payload as { config?: AdminSyntheticConfig }).config;
      if (nextConfig) {
        setConfig(nextConfig);
      }
      setSuccess("Synthetic config saved.");
    } catch (configError) {
      setError(configError instanceof Error ? configError.message : "Could not update synthetic config.");
    } finally {
      setBusyKey(null);
    }
  }

  async function provisionUsers() {
    const nextTarget = Number(targetCount);
    const nextGoals = Number(goalsPerUser);
    if (!Number.isInteger(nextTarget) || nextTarget < 1) {
      setError("Target count must be a positive integer.");
      return;
    }
    if (!Number.isInteger(nextGoals) || nextGoals < 1 || nextGoals > 12) {
      setError("Goals per user must be an integer between 1 and 12.");
      return;
    }
    setBusyKey("provision");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/synthetic-users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount: nextTarget, goalsPerUser: nextGoals }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readJsonErrorMessage(payload, "Could not provision synthetic users."));
      }
      await load();
      const provisionedCount = Number((payload as { provisionedCount?: number }).provisionedCount ?? nextTarget);
      setSuccess(`Provisioned ${provisionedCount} synthetic users.`);
    } catch (provisionError) {
      setError(provisionError instanceof Error ? provisionError.message : "Could not provision synthetic users.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Tick config</CardTitle>
          <CardDescription>
            Kill switch and per-tick caps. Disabling this pauses all synthetic activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) =>
                  setConfig((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              Tick enabled
            </label>
            <div className="space-y-1">
              <Label htmlFor="max-completions">Max completions / tick</Label>
              <Input
                id="max-completions"
                type="number"
                min={0}
                max={50}
                value={config.maxCompletionsPerTick}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    maxCompletionsPerTick: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="max-reactions">Max reactions / tick</Label>
              <Input
                id="max-reactions"
                type="number"
                min={0}
                max={100}
                value={config.maxReactionsPerTick}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    maxReactionsPerTick: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="throttle-dau">Throttle above real DAU</Label>
              <Input
                id="throttle-dau"
                type="number"
                min={0}
                value={config.throttleAboveRealDau}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    throttleAboveRealDau: Number(event.target.value),
                  }))
                }
              />
            </div>
          </div>
          <Button type="button" disabled={busyKey !== null} onClick={() => void saveConfig()}>
            Save config
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Scale roster</CardTitle>
          <CardDescription>
            Provisioning is idempotent. Raising the target count adds users without recreating existing ones.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="target-count">Target count</Label>
            <Input
              id="target-count"
              type="number"
              min={1}
              max={500}
              className="w-28"
              value={targetCount}
              onChange={(event) => setTargetCount(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="goals-per-user">Goals / user</Label>
            <Input
              id="goals-per-user"
              type="number"
              min={1}
              max={12}
              className="w-28"
              value={goalsPerUser}
              onChange={(event) => setGoalsPerUser(event.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={busyKey !== null}
            onClick={() => void provisionUsers()}
          >
            Provision
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Synthetic users</CardTitle>
          <CardDescription>
            Search and filter the roster, then edit main fields in place. Disable leaves the account in place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="synthetic-search">Search</Label>
              <Input
                id="synthetic-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Username, name, or archetype"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Persona</p>
              <Select
                value={persona}
                onValueChange={(value) => setPersona(value as "all" | SyntheticPersona)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All personas</SelectItem>
                  {SYNTHETIC_PERSONAS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Enabled</p>
              <Select
                value={enabledFilter}
                onValueChange={(value) => setEnabledFilter(value as "all" | "true" | "false")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Enabled</SelectItem>
                  <SelectItem value="false">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {items.length} synthetic users.
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading synthetic users…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No synthetic users match these filters.</p>
          ) : (
            filtered.map((user) => {
              const draft = drafts[user.userId] ?? toDraft(user);
              const busy = busyKey === user.userId;
              return (
                <article key={user.userId} className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {user.displayName ?? user.username}{" "}
                      <span className="font-normal text-muted-foreground">@{user.username}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.goalCount} goals · {user.completionsToday}/{user.dailyBudget} today
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor={`username-${user.userId}`}>Username</Label>
                      <Input
                        id={`username-${user.userId}`}
                        value={draft.username}
                        onChange={(event) => updateDraft(user.userId, { username: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`display-name-${user.userId}`}>Display name</Label>
                      <Input
                        id={`display-name-${user.userId}`}
                        value={draft.displayName}
                        onChange={(event) =>
                          updateDraft(user.userId, { displayName: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`archetype-${user.userId}`}>Archetype</Label>
                      <Input
                        id={`archetype-${user.userId}`}
                        value={draft.archetype}
                        onChange={(event) => updateDraft(user.userId, { archetype: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Persona</p>
                      <Select
                        value={draft.persona}
                        onValueChange={(value) =>
                          updateDraft(user.userId, { persona: value as SyntheticPersona })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYNTHETIC_PERSONAS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`budget-${user.userId}`}>Daily budget</Label>
                      <Input
                        id={`budget-${user.userId}`}
                        type="number"
                        min={1}
                        max={12}
                        value={draft.dailyBudget}
                        onChange={(event) =>
                          updateDraft(user.userId, { dailyBudget: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) =>
                            updateDraft(user.userId, { enabled: event.target.checked })
                          }
                        />
                        Enabled for ticks
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.socialActivityVisible}
                          onChange={(event) =>
                            updateDraft(user.userId, {
                              socialActivityVisible: event.target.checked,
                            })
                          }
                        />
                        Socially visible
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={busy || busyKey !== null} onClick={() => void saveUser(user.userId)}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || busyKey !== null || !draft.enabled}
                      onClick={() => void disableUser(user.userId)}
                    >
                      Disable
                    </Button>
                  </div>
                </article>
              );
            })
          )}
        </CardContent>
      </Card>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-muted-foreground">{success}</p> : null}
    </div>
  );
}
