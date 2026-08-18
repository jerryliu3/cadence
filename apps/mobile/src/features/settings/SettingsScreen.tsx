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
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { UserAvatar } from "../../ui/user-avatar";
import { IntegrationsSection } from "./IntegrationsSection";
import {
  buildMobileAvatarCleanupPathsForProfileChange,
  deleteMobileProfileAvatar,
  getMobileAvatarValidationError,
  uploadMobileProfileAvatar,
} from "../../lib/profile/avatar-upload";
import { buildMobileProfileQueryOptions } from "../social/mobile-profile-query";

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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const mountedRef = useRef(true);

  const profile = useQuery({
    ...buildMobileProfileQueryOptions({ userId }),
  });

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

  const fetchNotificationPreferences = async () =>
    api.getJson<NotificationPreferencesPayload>("/api/notifications/preferences");

  const applyLoadedNotificationPreferences = useCallback(
    (payload: NotificationPreferencesPayload) => {
      setNotificationPreferences(
        normalizeNotificationPreferences(payload.notificationPreferences)
      );
      setHasLoadedNotificationPreferences(true);
    },
    []
  );

  const applyNotificationPreferencesLoadError = useCallback((error: unknown) => {
    setHasLoadedNotificationPreferences(false);
    setMessage(
      getApiErrorMessage(
        error,
        "Notification category preferences could not be loaded."
      )
    );
  }, []);

  const loadNotificationPreferences = useCallback(
    async (shouldSkipUpdate: () => boolean = () => false) => {
      if (!userId) {
        if (!shouldSkipUpdate()) {
          setLoadingNotificationPreferences(false);
          setHasLoadedNotificationPreferences(false);
        }
        return;
      }

      if (!shouldSkipUpdate()) {
        setLoadingNotificationPreferences(true);
      }

      try {
        const response = await fetchNotificationPreferences();
        if (shouldSkipUpdate()) {
          return;
        }
        applyLoadedNotificationPreferences(response);
      } catch (error) {
        if (shouldSkipUpdate()) {
          return;
        }
        applyNotificationPreferencesLoadError(error);
      } finally {
        if (!shouldSkipUpdate()) {
          setLoadingNotificationPreferences(false);
        }
      }
    },
    [
      applyLoadedNotificationPreferences,
      applyNotificationPreferencesLoadError,
      userId,
    ]
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadNotificationPreferences(
      () => cancelled || !mountedRef.current
    );

    return () => {
      cancelled = true;
    };
  }, [loadNotificationPreferences]);

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
      <View style={[styles.profileCard, { borderColor: theme.colors.border }]}>
        <View style={styles.profileSummaryRow}>
          <UserAvatar
            avatarUrl={profile.data?.avatar_url ?? null}
            displayName={profile.data?.display_name ?? null}
            username={profile.data?.username ?? null}
            size={48}
          />
          <View style={{ gap: 4, flex: 1 }}>
            <Text
              style={{ color: theme.colors.foreground, fontWeight: "700", fontSize: 24 }}
            >
              {profile.data?.display_name ?? profile.data?.username ?? "Cadence user"}
            </Text>
            {profile.data?.username ? (
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 18 }}>
                @{profile.data.username}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <PrimaryButton
            label={avatarBusy ? "Uploading photo..." : "Upload photo"}
            disabled={!userId || avatarBusy}
            onPress={async () => {
              if (!userId) {
                return;
              }
              const picked = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                quality: 1,
                base64: false,
              });
              if (picked.canceled || !picked.assets[0]) {
                return;
              }

              const validationError = getMobileAvatarValidationError(
                picked.assets[0]
              );
              if (validationError) {
                setMessage(validationError);
                return;
              }

              setAvatarBusy(true);
              try {
                const previousAvatarUrl = profile.data?.avatar_url ?? null;
                const avatarUrl = await uploadMobileProfileAvatar({
                  userId,
                  asset: picked.assets[0],
                });
                const { error } = await supabase
                  .from("profiles")
                  .update({ avatar_url: avatarUrl })
                  .eq("id", userId);
                if (error) {
                  throw error;
                }
                const cleanupPaths = buildMobileAvatarCleanupPathsForProfileChange({
                  userId,
                  previousAvatarUrl,
                  nextAvatarUrl: avatarUrl,
                });
                if (cleanupPaths.length > 0) {
                  try {
                    await deleteMobileProfileAvatar({
                      objectPaths: cleanupPaths,
                    });
                  } catch (cleanupError) {
                    setMessage(
                      getApiErrorMessage(
                        cleanupError,
                        "Profile photo updated, but previous avatar cleanup failed."
                      )
                    );
                  }
                }
                setMessage("Profile photo updated.");
                await queryClient.invalidateQueries({
                  queryKey: ["mobile-profile", userId],
                });
              } catch (error) {
                setMessage(getApiErrorMessage(error, "Profile photo upload failed."));
              } finally {
                setAvatarBusy(false);
              }
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove profile photo"
            disabled={!userId || avatarBusy || !profile.data?.avatar_url}
            style={[
              styles.removePhotoButton,
              {
                borderColor: theme.colors.border,
                opacity:
                  !userId || avatarBusy || !profile.data?.avatar_url ? 0.6 : 1,
              },
            ]}
            onPress={() => {
              if (!userId) {
                return;
              }
              const removeAvatar = async () => {
                setAvatarBusy(true);
                try {
                  const previousAvatarUrl = profile.data?.avatar_url ?? null;
                  const { error } = await supabase
                    .from("profiles")
                    .update({ avatar_url: null })
                    .eq("id", userId);
                  if (error) {
                    setMessage(error.message);
                    return;
                  }
                  const cleanupPaths = buildMobileAvatarCleanupPathsForProfileChange({
                    userId,
                    previousAvatarUrl,
                    nextAvatarUrl: null,
                  });
                  if (cleanupPaths.length > 0) {
                    await deleteMobileProfileAvatar({
                      objectPaths: cleanupPaths,
                    });
                  }
                  setMessage("Profile photo removed.");
                  await queryClient.invalidateQueries({
                    queryKey: ["mobile-profile", userId],
                  });
                } catch (error) {
                  setMessage(getApiErrorMessage(error, "Profile photo removal failed."));
                } finally {
                  setAvatarBusy(false);
                }
              };
              void removeAvatar();
            }}
          >
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              Remove photo
            </Text>
          </Pressable>
        </View>
      </View>
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
      {loadingNotificationPreferences ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Loading notification categories...
        </Text>
      ) : !hasLoadedNotificationPreferences ? (
        <View style={styles.preferenceUnavailable}>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Notification categories are unavailable. Retry to load your saved settings.
          </Text>
          <PrimaryButton
            label="Retry categories"
            onPress={() =>
              void loadNotificationPreferences(() => !mountedRef.current)
            }
          />
        </View>
      ) : (
        notificationPreferenceCategories.map((category) => {
          const checked = notificationPreferences[category.key];
          const disabled = !userId || savingPreferenceKey !== null;

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
        })
      )}
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
  profileCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  profileSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  removePhotoButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
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
  preferenceUnavailable: {
    gap: 12,
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
