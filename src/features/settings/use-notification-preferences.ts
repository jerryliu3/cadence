"use client";

import {
  defaultNotificationPreferences,
  normalizeNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@cadence/shared/notifications/preferences";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  getApiErrorMessage,
  getJson,
  putJson,
} from "@/lib/api/client";
import type { NotificationPreferencesResponsePayload } from "@/lib/notifications/preferences";

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    defaultNotificationPreferences
  );
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [savingPreferenceKey, setSavingPreferenceKey] =
    useState<NotificationPreferenceKey | null>(null);
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    setLoadingPreferences(true);
    try {
      const response = await getJson<NotificationPreferencesResponsePayload>(
        "/api/notifications/preferences"
      );
      setPreferences(
        normalizeNotificationPreferences(response.notificationPreferences)
      );
      setHasLoadedPreferences(true);
      setLoadErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        "Notification category preferences could not be loaded."
      );
      setHasLoadedPreferences(false);
      setLoadErrorMessage(message);
      toast.error(message);
    } finally {
      setLoadingPreferences(false);
    }
  }, []);

  const togglePreference = useCallback(
    async (key: NotificationPreferenceKey, enabled: boolean) => {
      if (!hasLoadedPreferences || savingPreferenceKey !== null) {
        return;
      }

      const previous = preferences;
      const next = {
        ...preferences,
        [key]: enabled,
      };
      setPreferences(next);
      setSavingPreferenceKey(key);

      try {
        const response = await putJson<
          NotificationPreferencesResponsePayload,
          NotificationPreferencesResponsePayload
        >("/api/notifications/preferences", {
          notificationPreferences: next,
        });
        setPreferences(
          normalizeNotificationPreferences(response.notificationPreferences)
        );
      } catch (error) {
        setPreferences(previous);
        toast.error(
          getApiErrorMessage(
            error,
            "Notification category preferences could not be saved."
          )
        );
      } finally {
        setSavingPreferenceKey(null);
      }
    },
    [hasLoadedPreferences, preferences, savingPreferenceKey]
  );

  return {
    preferences,
    loadingPreferences,
    savingPreferenceKey,
    hasLoadedPreferences,
    loadErrorMessage,
    loadPreferences,
    togglePreference,
  };
}
