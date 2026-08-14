import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import {
  HEALTH_DISCONNECT_COPY,
  HEALTH_METRIC_KEYS,
  HEALTH_METRIC_LABELS,
  HEALTH_PROVIDER_LABELS,
  HEALTH_SYNC_STATE_COPY,
  type HealthMetricKey,
  type HealthProvider,
} from "@cadence/shared/health/providers";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { createNativeHealthConnectBridge, createNativeHealthKitBridge, nativeHealthProvider } from "../health/native-bridges";
import {
  deleteHealthAutocompleteRule,
  disconnectHealthProvider,
  fetchHealthStatus,
  upsertHealthAutocompleteRule,
} from "../health/sync-client";
import {
  reportHealthSyncFailure,
  syncAppleHealth,
  syncHealthConnect,
} from "../health/sync-runner";

interface GoalOption {
  id: string;
  title: string;
}

export function IntegrationsSection({ userId }: { userId: string | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [goalId, setGoalId] = useState("");
  const [threshold, setThreshold] = useState("8000");
  const [metricKey, setMetricKey] = useState<HealthMetricKey>("steps");
  const provider = nativeHealthProvider();

  const status = useQuery({
    queryKey: ["mobile-health-status", userId],
    enabled: Boolean(userId),
    queryFn: fetchHealthStatus,
  });
  const goals = useQuery({
    queryKey: ["mobile-health-goals", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("id,title")
        .eq("owner_id", userId ?? "")
        .eq("is_deleted", false)
        .order("title");
      if (error) {
        throw error;
      }
      return (data ?? []) as GoalOption[];
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["mobile-health-status"] });
  };

  const connectOrResync = async () => {
    if (!provider) {
      setMessage("Health sync is available on iOS and Android.");
      return;
    }
    try {
      if (provider === "apple_healthkit") {
        const bridge = await createNativeHealthKitBridge();
        if (!bridge) {
          setMessage("Apple Health is not available on this build.");
          return;
        }
        await syncAppleHealth(bridge);
      } else {
        const bridge = await createNativeHealthConnectBridge();
        if (!bridge) {
          setMessage("Health Connect is not available on this build.");
          return;
        }
        await syncHealthConnect(bridge);
      }
      setMessage("Sync finished.");
      await refresh();
    } catch (error) {
      await reportHealthSyncFailure(provider, error);
      setMessage(error instanceof Error ? error.message : "Health sync failed.");
      await refresh();
    }
  };

  const disconnect = async (target: HealthProvider) => {
    try {
      await disconnectHealthProvider(target);
      setMessage(
        `${HEALTH_PROVIDER_LABELS[target]} disconnected. ${HEALTH_DISCONNECT_COPY}`
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Disconnect failed."
      );
    }
  };

  const saveRule = async () => {
    const selectedGoalId = goalId || goals.data?.[0]?.id;
    const thresholdNumeric = Number(threshold);
    if (!selectedGoalId || !Number.isFinite(thresholdNumeric)) {
      setMessage("Choose a goal and a numeric threshold.");
      return;
    }
    try {
      await upsertHealthAutocompleteRule({
        goalId: selectedGoalId,
        metricKey,
        thresholdNumeric,
        enabled: true,
      });
      setMessage("Auto-complete rule saved.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rule save failed.");
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
        Integrations
      </Text>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Evidence-based sync status only. Social surfaces never show raw health
        values.
      </Text>
      {(status.data?.providers ?? []).map((item) => {
        const copy = HEALTH_SYNC_STATE_COPY[item.state];
        return (
          <View key={item.provider} style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.foreground }}>
              {HEALTH_PROVIDER_LABELS[item.provider]} · {copy.title}
            </Text>
            <Text style={{ color: theme.colors.mutedForeground }}>
              {copy.detail}
            </Text>
            {item.lastError ? (
              <Text style={{ color: theme.colors.destructive }}>
                {item.lastError}
              </Text>
            ) : null}
            {provider === item.provider ? (
              <PrimaryButton
                label={item.state === "never_asked" ? "Connect and sync" : "Resync"}
                onPress={() => void connectOrResync()}
              />
            ) : (
              <Text style={{ color: theme.colors.mutedForeground }}>
                Use {Platform.OS === "ios" ? "an Android" : "an iPhone"} to
                manage this provider.
              </Text>
            )}
            <PrimaryButton
              label={`Disconnect ${HEALTH_PROVIDER_LABELS[item.provider]}`}
              disabled={item.state === "never_asked"}
              onPress={() => void disconnect(item.provider)}
            />
          </View>
        );
      })}
      <Text style={{ color: theme.colors.mutedForeground }}>
        {HEALTH_DISCONNECT_COPY}
      </Text>
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
        Auto-complete
      </Text>
      <TextInput
        value={goalId || goals.data?.[0]?.id || ""}
        onChangeText={setGoalId}
        placeholder="Goal id"
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          color: theme.colors.foreground,
          borderRadius: 10,
          padding: 10,
        }}
      />
      <TextInput
        value={metricKey}
        onChangeText={(value) => {
          if (HEALTH_METRIC_KEYS.includes(value as HealthMetricKey)) {
            setMetricKey(value as HealthMetricKey);
          }
        }}
        placeholder="Metric key"
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          color: theme.colors.foreground,
          borderRadius: 10,
          padding: 10,
        }}
      />
      <TextInput
        keyboardType="numeric"
        value={threshold}
        onChangeText={setThreshold}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          color: theme.colors.foreground,
          borderRadius: 10,
          padding: 10,
        }}
      />
      <PrimaryButton label="Save auto-complete rule" onPress={() => void saveRule()} />
      {(status.data?.autocompleteRules ?? []).map((rule) => (
        <Text key={rule.id} style={{ color: theme.colors.foreground }}>
          {HEALTH_METRIC_LABELS[rule.metricKey]} ≥ {rule.thresholdNumeric}{" "}
          <Text
            onPress={() => {
              void deleteHealthAutocompleteRule(rule.id).then(refresh);
            }}
            style={{ color: theme.colors.mutedForeground }}
          >
            Remove
          </Text>
        </Text>
      ))}
      {message ? (
        <Text style={{ color: theme.colors.foreground }}>{message}</Text>
      ) : null}
    </View>
  );
}
