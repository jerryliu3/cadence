"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  HEALTH_DISCONNECT_COPY,
  HEALTH_METRIC_KEYS,
  HEALTH_METRIC_LABELS,
  HEALTH_PROVIDER_LABELS,
  HEALTH_SYNC_STATE_COPY,
  type HealthMetricKey,
  type HealthProvider,
} from "@cadence/shared/health/providers";
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
import {
  deleteJson,
  getApiErrorMessage,
  getJson,
  putJson,
  postJson,
} from "@/lib/api/client";
import type {
  HealthAutocompleteRuleStatus,
  HealthProviderStatus,
} from "@/lib/health/status-payload";
import type { Goal } from "@/lib/goals/types";

interface HealthStatusPayload {
  providers: HealthProviderStatus[];
  autocompleteRules: HealthAutocompleteRuleStatus[];
}

interface ConfigPayload {
  flags?: { integrationsEnabled?: boolean };
}

export function IntegrationsSettings({ goals }: { goals: Goal[] }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<HealthProviderStatus[]>([]);
  const [rules, setRules] = useState<HealthAutocompleteRuleStatus[]>([]);
  const firstGoalId = goals[0]?.id ?? "";
  const [goalIdOverride, setGoalIdOverride] = useState<string | null>(null);
  const goalId = goalIdOverride ?? firstGoalId;
  const [metricKey, setMetricKey] = useState<HealthMetricKey>("steps");
  const [threshold, setThreshold] = useState("8000");
  const [saving, setSaving] = useState(false);

  const goalTitleById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.title])),
    [goals]
  );

  const loadStatus = async () => {
    const payload = await getJson<HealthStatusPayload>("/api/health/status");
    setProviders(payload.providers);
    setRules(payload.autocompleteRules ?? []);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const config = await getJson<ConfigPayload>("/api/config");
        const integrationsEnabled = Boolean(config.flags?.integrationsEnabled);
        setEnabled(integrationsEnabled);
        if (integrationsEnabled) {
          await loadStatus();
        }
      } catch (error) {
        toast.error(
          getApiErrorMessage(error, "Integrations could not be loaded.")
        );
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading || enabled === null) {
    return (
      <p className="text-sm text-muted-foreground">Loading integrations...</p>
    );
  }

  if (!enabled) {
    return null;
  }

  const disconnect = async (provider: HealthProvider) => {
    setSaving(true);
    try {
      await postJson("/api/health/disconnect", { provider });
      toast.success(`${HEALTH_PROVIDER_LABELS[provider]} disconnected.`);
      await loadStatus();
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Provider could not be disconnected.")
      );
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async () => {
    if (!goalId) {
      toast.error("Choose a goal first.");
      return;
    }
    const thresholdNumeric = Number(threshold);
    if (!Number.isFinite(thresholdNumeric) || thresholdNumeric < 0) {
      toast.error("Enter a non-negative threshold.");
      return;
    }
    setSaving(true);
    try {
      await putJson("/api/health/autocomplete-rules", {
        goalId,
        metricKey,
        thresholdNumeric,
        enabled: true,
      });
      toast.success("Auto-complete rule saved.");
      await loadStatus();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Auto-complete rule could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (id: string) => {
    setSaving(true);
    try {
      await deleteJson("/api/health/autocomplete-rules", { query: { id } });
      await loadStatus();
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Auto-complete rule could not be deleted.")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Health providers sync from the iOS and Android apps. Social surfaces
        show derived XP and rank only — never raw health values.
      </p>

      <div className="space-y-4">
        {providers.map((provider) => {
          const copy = HEALTH_SYNC_STATE_COPY[provider.state];
          return (
            <div
              key={provider.provider}
              className="space-y-2 rounded-lg border px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {HEALTH_PROVIDER_LABELS[provider.provider]}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {copy.title}. {copy.detail}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving || provider.state === "never_asked"}
                  onClick={() => void disconnect(provider.provider)}
                >
                  Disconnect
                </Button>
              </div>
              {provider.lastError ? (
                <p className="text-sm text-destructive">{provider.lastError}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Use the mobile app to connect or resync. {HEALTH_DISCONNECT_COPY}
              </p>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <p className="font-medium">Auto-complete opt-in</p>
        <p className="text-sm text-muted-foreground">
          When a daily total meets a threshold, Cadence can complete a goal for
          today or yesterday. Unmarked days stay unmarked.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="health-rule-goal">Goal</Label>
            <Select value={goalId} onValueChange={setGoalIdOverride}>
              <SelectTrigger id="health-rule-goal">
                <SelectValue placeholder="Select a goal" />
              </SelectTrigger>
              <SelectContent>
                {goals.map((goal) => (
                  <SelectItem key={goal.id} value={goal.id}>
                    {goal.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="health-rule-metric">Metric</Label>
            <Select
              value={metricKey}
              onValueChange={(value) => setMetricKey(value as HealthMetricKey)}
            >
              <SelectTrigger id="health-rule-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEALTH_METRIC_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {HEALTH_METRIC_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="health-rule-threshold">Threshold</Label>
            <Input
              id="health-rule-threshold"
              inputMode="decimal"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </div>
        </div>
        <Button type="button" size="sm" disabled={saving} onClick={() => void saveRule()}>
          Save rule
        </Button>
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>
                {goalTitleById.get(rule.goalId) ?? "Goal"} ·{" "}
                {HEALTH_METRIC_LABELS[rule.metricKey]} ≥ {rule.thresholdNumeric}
                {rule.enabled ? "" : " (paused)"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => void removeRule(rule.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
