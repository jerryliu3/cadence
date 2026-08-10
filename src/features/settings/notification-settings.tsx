"use client";

import {
  Bell,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  formatHour,
  sortSchedules,
  type NotificationSchedule,
} from "@/features/settings/notification-schedule-utils";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_MESSAGE = "Complete your checklist for today";
const DEFAULT_NOTIFICATION_HOUR = 21;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

export function NotificationSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [schedules, setSchedules] = useState<NotificationSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const [hour, setHour] = useState("18");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [timezone, setTimezone] = useState("UTC");
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null);
  const [changingPushStatus, setChangingPushStatus] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserId("");
      setSchedules([]);
      setLoadingSchedules(false);
      return;
    }

    setUserId(user.id);

    const { data, error } = await supabase
      .from("notification_schedules")
      .select("*")
      .eq("user_id", user.id)
      .order("hour");

    if (error) {
      toast.error("Could not load notification schedules.");
      setSchedules([]);
      setLoadingSchedules(false);
      return;
    }

    let loadedSchedules = (data ?? []) as NotificationSchedule[];

    if (!loadedSchedules.some((schedule) => schedule.is_default)) {
      const matchingSchedule = loadedSchedules.find(
        (schedule) =>
          schedule.hour === DEFAULT_NOTIFICATION_HOUR &&
          schedule.message === DEFAULT_MESSAGE
      );
      const detectedTimezone = resolveUserTimezone();
      const defaultScheduleWrite = matchingSchedule
        ? supabase
            .from("notification_schedules")
            .update({ is_default: true, updated_at: new Date().toISOString() })
            .eq("id", matchingSchedule.id)
            .eq("user_id", user.id)
        : supabase.from("notification_schedules").insert({
            user_id: user.id,
            hour: DEFAULT_NOTIFICATION_HOUR,
            timezone: detectedTimezone,
            message: DEFAULT_MESSAGE,
            enabled: true,
            is_default: true,
          });
      const { data: defaultSchedule, error: defaultScheduleError } =
        await defaultScheduleWrite.select("*").single();

      if (defaultScheduleError?.code === "23505") {
        const { data: refreshedSchedules, error: refreshError } = await supabase
          .from("notification_schedules")
          .select("*")
          .eq("user_id", user.id)
          .order("hour");

        if (refreshError) {
          toast.error("Could not load the default 9:00 PM reminder.");
        } else {
          loadedSchedules = (refreshedSchedules ?? []) as NotificationSchedule[];
        }
      } else if (defaultScheduleError) {
        console.error("Failed to create the default notification schedule:", defaultScheduleError);
        toast.error("Could not create the default 9:00 PM reminder.");
      } else {
        loadedSchedules = [
          ...loadedSchedules.filter((schedule) => schedule.id !== defaultSchedule.id),
          defaultSchedule as NotificationSchedule,
        ];
      }
    }

    setSchedules(sortSchedules(loadedSchedules));
    setLoadingSchedules(false);
  }, [supabase]);

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

  const addSchedule = async () => {
    const trimmedMessage = message.trim();

    if (!userId || !trimmedMessage) {
      return;
    }

    setSavingSchedule(true);

    const { data, error } = await supabase
      .from("notification_schedules")
      .insert({
        user_id: userId,
        hour: Number(hour),
        timezone,
        message: trimmedMessage,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Failed to create notification schedule:", error);
      toast.error("Could not create the notification schedule.");
    } else {
      setSchedules((current) =>
        sortSchedules([...current, data as NotificationSchedule])
      );
      setMessage(DEFAULT_MESSAGE);
      toast.success(`Daily reminder added for ${formatHour(Number(hour))}.`);
    }

    setSavingSchedule(false);
  };

  const toggleSchedule = async (schedule: NotificationSchedule) => {
    setPendingScheduleId(schedule.id);
    const enabled = !schedule.enabled;
    const { error } = await supabase
      .from("notification_schedules")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", schedule.id)
      .eq("user_id", userId);

    if (error) {
      toast.error("Could not update the notification schedule.");
    } else {
      setSchedules((current) =>
        current.map((item) => (item.id === schedule.id ? { ...item, enabled } : item))
      );
    }

    setPendingScheduleId(null);
  };

  const deleteSchedule = async (schedule: NotificationSchedule) => {
    if (schedule.is_default) {
      return;
    }

    setPendingScheduleId(schedule.id);
    const { error } = await supabase
      .from("notification_schedules")
      .delete()
      .eq("id", schedule.id)
      .eq("user_id", userId);

    if (error) {
      toast.error("Could not delete the notification schedule.");
    } else {
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      toast.success("Notification schedule deleted.");
    }

    setPendingScheduleId(null);
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
