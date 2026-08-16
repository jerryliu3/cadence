import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiErrorMessage } from "@cadence/shared/api-client";
import {
  defaultNotificationPreferences,
  normalizeNotificationPreferences,
  notificationPreferenceCategories,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@cadence/shared/notifications/preferences";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../lib/api";
import {
  isNativePushConfigured,
  registerNativePush,
  unregisterNativePush,
} from "../../lib/push";
import { captureMobileSentryException } from "../../lib/sentry";
import { useSession } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { Screen } from "../../ui/screen";
import { IntegrationsSection } from "./IntegrationsSection";

interface NotificationSchedule {
  id: string;
  hour: number;
  timezone: string;
  message: string;
  enabled: boolean;
}

interface NotificationPreferencesPayload {
  notificationPreferences: NotificationPreferences;
}

export function SettingsScreen() {
  const theme = useTheme();
  const { session, userId } = useSession();
  const queryClient = useQueryClient();
  const [hour, setHour] = useState("18");
  const [message, setMessage] = useState<string | null>(null);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(defaultNotificationPreferences);
  const [loadingNotificationPreferences, setLoadingNotificationPreferences] =
    useState(true);
  const [savingPreferenceKey, setSavingPreferenceKey] =
    useState<NotificationPreferenceKey | null>(null);
  const [hasLoadedNotificationPreferences, setHasLoadedNotificationPreferences] =
    useState(false);

  const schedules = useQuery({
    queryKey: ["mobile-notification-schedules", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_schedules")
        .select("id,hour,timezone,message,enabled")
        .eq("user_id", userId ?? "")
        .order("hour");
      if (error) {
        throw error;
      }
      return (data ?? []) as NotificationSchedule[];
    },
  });

  useEffect(() => {
    let cancelled = false;

    const loadNotificationPreferences = async () => {
      if (!userId) {
        if (!cancelled) {
          setLoadingNotificationPreferences(false);
          setHasLoadedNotificationPreferences(false);
        }
        return;
      }

      setLoadingNotificationPreferences(true);

      try {
        const response = await api.getJson<NotificationPreferencesPayload>(
          "/api/notifications/preferences"
        );
        if (!cancelled) {
          setNotificationPreferences(
            normalizeNotificationPreferences(response.notificationPreferences)
          );
          setHasLoadedNotificationPreferences(true);
        }
      } catch (error) {
        if (!cancelled) {
          setHasLoadedNotificationPreferences(false);
          setMessage(
            getApiErrorMessage(
              error,
              "Notification category preferences could not be loaded."
            )
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingNotificationPreferences(false);
        }
      }
    };

    void loadNotificationPreferences();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggleNotificationPreference = async (key: NotificationPreferenceKey) => {
    if (!userId || !hasLoadedNotificationPreferences || savingPreferenceKey !== null) {
      return;
    }

    const previous = notificationPreferences;
    const next = {
      ...notificationPreferences,
      [key]: !notificationPreferences[key],
    };

    setNotificationPreferences(next);
    setSavingPreferenceKey(key);

    try {
      const response = await api.putJson<
        NotificationPreferencesPayload,
        NotificationPreferencesPayload
      >("/api/notifications/preferences", {
        notificationPreferences: next,
      });
      setNotificationPreferences(
        normalizeNotificationPreferences(response.notificationPreferences)
      );
    } catch (error) {
      setNotificationPreferences(previous);
      setMessage(
        getApiErrorMessage(
          error,
          "Notification category preferences could not be saved."
        )
      );
    } finally {
      setSavingPreferenceKey(null);
    }
  };

  return (
    <Screen title="Profile">
      <Text style={{ color: theme.colors.foreground }}>{session?.user.email}</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>Reminder hour (0-23)</Text>
      <TextInput
        keyboardType="number-pad"
        value={hour}
        onChangeText={setHour}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          color: theme.colors.foreground,
          borderRadius: 10,
          padding: 10,
        }}
      />
      <PrimaryButton
        label="Save reminder"
        onPress={async () => {
          if (!userId) {
            return;
          }
          const parsedHour = Number(hour);
          const { error } = await supabase.from("notification_schedules").insert({
            user_id: userId,
            hour: parsedHour,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            message: "Complete your checklist for today",
            enabled: true,
          });
          setMessage(error ? error.message : "Reminder saved.");
          await queryClient.invalidateQueries({
            queryKey: ["mobile-notification-schedules"],
          });
        }}
      />
      {(schedules.data ?? []).map((schedule) => (
        <Text key={schedule.id} style={{ color: theme.colors.foreground }}>
          {schedule.hour}:00 · {schedule.timezone}
        </Text>
      ))}
      {isNativePushConfigured() ? (
        <PrimaryButton
          label="Enable push"
          onPress={async () => {
            try {
              await registerNativePush();
              setMessage("This device is registered for push.");
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Push registration failed."
              );
            }
          }}
        />
      ) : (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Push is not configured for this build.
        </Text>
      )}
      <View style={styles.preferenceHeader}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          Notification categories
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          Choose which categories can trigger push notifications.
        </Text>
      </View>
      {notificationPreferenceCategories.map((category) => {
        const checked = notificationPreferences[category.key];
        const disabled =
          !userId ||
          !hasLoadedNotificationPreferences ||
          loadingNotificationPreferences ||
          savingPreferenceKey !== null;

        return (
          <Pressable
            key={category.key}
            accessibilityRole="checkbox"
            accessibilityLabel={category.label}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => void toggleNotificationPreference(category.key)}
            style={[
              styles.preferenceRow,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
                opacity: disabled ? 0.6 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.preferenceCheckbox,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: checked ? theme.colors.primary : theme.colors.card,
                },
              ]}
            >
              <Text style={{ color: theme.colors.primaryForeground }}>
                {checked ? "✓" : ""}
              </Text>
            </View>
            <View style={styles.preferenceCopy}>
              <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
                {category.label}
              </Text>
              <Text style={{ color: theme.colors.mutedForeground }}>
                {category.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <IntegrationsSection userId={userId} />
      <PrimaryButton
        label="Sign out"
        onPress={async () => {
          try {
            await unregisterNativePush();
          } catch (error) {
            captureMobileSentryException(error);
          }
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        }}
      />
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preferenceHeader: {
    gap: 4,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  preferenceCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  preferenceCopy: {
    flex: 1,
    gap: 4,
  },
});
