"use client";

import {
  Bell,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getPushRegistration,
  isPushSupported,
  removePushSubscription,
  savePushSubscription,
  urlBase64ToUint8Array,
} from "@/lib/push/client";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import {
  NotificationPushSection,
  type PushStatus,
} from "@/features/settings/notification-push-section";
import { NotificationScheduleSection } from "@/features/settings/notification-schedule-section";
import { useNotificationSchedules } from "@/features/settings/use-notification-schedules";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_MESSAGE = "Complete your checklist for today";
const DEFAULT_NOTIFICATION_HOUR = 21;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

export function NotificationSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null);
  const [changingPushStatus, setChangingPushStatus] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
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

  useEffect(() => {
    const initializePush = async () => {
      await Promise.resolve();

      const detectedTimezone = resolveUserTimezone();
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      setTimezone(detectedTimezone);
      setIsIOS(ios);
      setIsStandalone(standalone);

      if (!isPushSupported()) {
        setPushStatus("unsupported");
        return;
      }

      if (!VAPID_PUBLIC_KEY) {
        setPushStatus("not-configured");
        return;
      }

      if (Notification.permission === "denied") {
        setPushStatus("denied");
        return;
      }

      try {
        const registration = await getPushRegistration();
        const existingSubscription = await registration.pushManager.getSubscription();

        if (!existingSubscription) {
          setPushStatus("unsubscribed");
          return;
        }

        setPushSubscription(existingSubscription);
        try {
          await savePushSubscription(existingSubscription);
          setPushStatus("subscribed");
        } catch (error) {
          console.error("Failed to sync the existing push subscription:", error);
          setPushStatus("subscription-error");
        }
      } catch (error) {
        console.error("Failed to initialize push notifications:", error);
        setPushStatus("not-configured");
      }
    };

    const initializeSchedules = async () => {
      await loadSchedules();
    };

    void initializePush();
    void initializeSchedules();
  }, [loadSchedules]);

  const enablePush = async () => {
    setChangingPushStatus(true);

    try {
      const registration = await getPushRegistration();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      try {
        await savePushSubscription(subscription);
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }

      setPushSubscription(subscription);
      setPushStatus("subscribed");
      toast.success("Push notifications enabled on this device.");
    } catch (error) {
      if (Notification.permission === "denied") {
        setPushStatus("denied");
        toast.error("Notification permission was denied. Enable it in your device settings.");
      } else {
        console.error("Failed to enable push notifications:", error);
        toast.error(error instanceof Error ? error.message : "Could not enable push notifications.");
      }
    } finally {
      setChangingPushStatus(false);
    }
  };

  const disablePush = async () => {
    if (!pushSubscription) {
      return;
    }

    setChangingPushStatus(true);

    try {
      let serverCleanupFailed = false;

      try {
        await removePushSubscription(pushSubscription.endpoint);
      } catch (error) {
        serverCleanupFailed = true;
        console.error("Failed to remove the stored push subscription:", error);
      }

      await pushSubscription.unsubscribe();
      setPushSubscription(null);
      setPushStatus("unsubscribed");

      if (serverCleanupFailed) {
        toast.warning("Notifications are off. Server cleanup will finish automatically.");
      } else {
        toast.success("Push notifications disabled on this device.");
      }
    } catch (error) {
      console.error("Failed to disable push notifications:", error);
      toast.error(error instanceof Error ? error.message : "Could not disable push notifications.");
    } finally {
      setChangingPushStatus(false);
    }
  };

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
    </div>
  );
}
