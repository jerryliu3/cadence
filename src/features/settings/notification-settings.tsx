"use client";

import { useEffect, useMemo } from "react";
import {
  NotificationPreferencesSection,
} from "@/features/settings/notification-preferences-section";
import {
  NotificationPushSection,
} from "@/features/settings/notification-push-section";
import { NotificationScheduleSection } from "@/features/settings/notification-schedule-section";
import { useNotificationPreferences } from "@/features/settings/use-notification-preferences";
import { useNotificationPush } from "@/features/settings/use-notification-push";
import { useNotificationSchedules } from "@/features/settings/use-notification-schedules";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_MESSAGE = "Complete your checklist for today";
const DEFAULT_NOTIFICATION_HOUR = 21;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

export function NotificationSettings() {
  const supabase = useMemo(() => createClient(), []);
  const {
    userId,
    schedules,
    loadingSchedules,
    savingSchedule,
    pendingScheduleId,
    hour,
    setHour,
    message,
    setMessage,
    timezone,
    setTimezone,
    loadSchedules,
    addSchedule,
    toggleSchedule,
    deleteSchedule,
  } = useNotificationSchedules({
    supabase,
    defaultNotificationHour: DEFAULT_NOTIFICATION_HOUR,
    defaultMessage: DEFAULT_MESSAGE,
  });
  const {
    pushStatus,
    pushSubscription,
    changingPushStatus,
    isIOS,
    isStandalone,
    initializePush,
    enablePush,
    disablePush,
  } = useNotificationPush({
    vapidPublicKey: VAPID_PUBLIC_KEY,
    onDetectedTimezone: setTimezone,
  });
  const {
    preferences,
    loadingPreferences,
    hasLoadedPreferences,
    loadErrorMessage,
    savingPreferenceKey,
    loadPreferences,
    togglePreference,
  } = useNotificationPreferences();

  useEffect(() => {
    void initializePush();
    void loadSchedules();
    void loadPreferences();
  }, [initializePush, loadPreferences, loadSchedules]);

  return (
    <div className="space-y-6 border-t pt-5">
      <NotificationPushSection
        pushStatus={pushStatus}
        pushSubscription={pushSubscription}
        changingPushStatus={changingPushStatus}
        isIOS={isIOS}
        isStandalone={isStandalone}
        onEnablePush={enablePush}
        onDisablePush={disablePush}
      />

      <NotificationScheduleSection
        timezone={timezone}
        hour={hour}
        onHourChange={setHour}
        message={message}
        onMessageChange={setMessage}
        canAddSchedule={!savingSchedule && Boolean(message.trim()) && Boolean(userId)}
        savingSchedule={savingSchedule}
        onAddSchedule={addSchedule}
        loadingSchedules={loadingSchedules}
        schedules={schedules}
        pendingScheduleId={pendingScheduleId}
        onToggleSchedule={toggleSchedule}
        onDeleteSchedule={deleteSchedule}
        defaultNotificationHour={DEFAULT_NOTIFICATION_HOUR}
        defaultMessage={DEFAULT_MESSAGE}
      />

      <NotificationPreferencesSection
        preferences={preferences}
        loadingPreferences={loadingPreferences}
        hasLoadedPreferences={hasLoadedPreferences}
        loadErrorMessage={loadErrorMessage}
        savingPreferenceKey={savingPreferenceKey}
        onRetryLoad={() => void loadPreferences()}
        onTogglePreference={togglePreference}
      />
    </div>
  );
}
