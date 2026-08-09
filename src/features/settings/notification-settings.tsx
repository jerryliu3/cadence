"use client";

import {
  Bell,
  BellOff,
  Clock3,
  LoaderCircle,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { getApiErrorMessage, isApiClientError } from "@/lib/api/client";
import {
  createNotificationSchedule,
  deleteNotificationSchedule,
  updateNotificationSchedule,
} from "@/lib/api/notification-schedules-client";
import {
  getPushRegistration,
  isPushSupported,
  removePushSubscription,
  savePushSubscription,
  urlBase64ToUint8Array,
} from "@/lib/push/client";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_MESSAGE = "Complete your checklist for today";
const DEFAULT_NOTIFICATION_HOUR = 21;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

type PushStatus =
  | "checking"
  | "unsupported"
  | "denied"
  | "unsubscribed"
  | "subscribed"
  | "subscription-error"
  | "not-configured";

interface NotificationSchedule {
  id: string;
  user_id: string;
  hour: number;
  timezone: string;
  message: string;
  enabled: boolean;
  is_default: boolean;
  last_sent_local_date: string | null;
  created_at: string;
  updated_at: string;
}

function formatHour(hour: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2020, 0, 1, hour));
}

function sortSchedules(schedules: NotificationSchedule[]): NotificationSchedule[] {
  return [...schedules].sort((left, right) => {
    if (left.hour !== right.hour) {
      return left.hour - right.hour;
    }

    if (left.is_default !== right.is_default) {
      return left.is_default ? -1 : 1;
    }

    return left.created_at.localeCompare(right.created_at);
  });
}

function getScheduleToggleLabel(schedule: NotificationSchedule): string {
  if (schedule.is_default) {
    return schedule.enabled ? "Disable" : "Enable";
  }

  return schedule.enabled ? "Pause" : "Resume";
}

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
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      try {
        const defaultSchedule = matchingSchedule
          ? await updateNotificationSchedule({
              id: matchingSchedule.id,
              isDefault: true,
            })
          : await createNotificationSchedule({
              hour: DEFAULT_NOTIFICATION_HOUR,
              timezone: detectedTimezone,
              message: DEFAULT_MESSAGE,
              enabled: true,
              isDefault: true,
            });

        loadedSchedules = [
          ...loadedSchedules.filter((schedule) => schedule.id !== defaultSchedule.id),
          defaultSchedule as NotificationSchedule,
        ];
      } catch (error) {
        if (isApiClientError(error) && error.status === 409) {
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
        } else {
          console.error(
            "Failed to create the default notification schedule:",
            error
          );
          toast.error("Could not create the default 9:00 PM reminder.");
        }
      }
    }

    setSchedules(sortSchedules(loadedSchedules));
    setLoadingSchedules(false);
  }, [supabase]);

  useEffect(() => {
    const initializePush = async () => {
      await Promise.resolve();

      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

      setTimezone(detectedTimezone || "UTC");
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
    try {
      const schedule = await createNotificationSchedule({
        hour: Number(hour),
        timezone,
        message: trimmedMessage,
      });
      setSchedules((current) =>
        sortSchedules([...current, schedule as NotificationSchedule])
      );
      setMessage(DEFAULT_MESSAGE);
      toast.success(`Daily reminder added for ${formatHour(Number(hour))}.`);
    } catch (error) {
      console.error("Failed to create notification schedule:", error);
      toast.error(getApiErrorMessage(error, "Could not create the notification schedule."));
    }
    setSavingSchedule(false);
  };

  const toggleSchedule = async (schedule: NotificationSchedule) => {
    setPendingScheduleId(schedule.id);
    const enabled = !schedule.enabled;
    try {
      await updateNotificationSchedule({
        id: schedule.id,
        enabled,
      });
      setSchedules((current) =>
        current.map((item) => (item.id === schedule.id ? { ...item, enabled } : item))
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update the notification schedule."));
    }

    setPendingScheduleId(null);
  };

  const deleteSchedule = async (schedule: NotificationSchedule) => {
    if (schedule.is_default) {
      return;
    }

    setPendingScheduleId(schedule.id);
    try {
      await deleteNotificationSchedule(schedule.id);
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      toast.success("Notification schedule deleted.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not delete the notification schedule."));
    }

    setPendingScheduleId(null);
  };

  const pushStatusCopy = {
    checking: "Checking this device…",
    unsupported: "Push notifications are not available in this browser.",
    denied: "Notifications are blocked in this device's settings.",
    unsubscribed: "Push notifications are off on this device.",
    subscribed: "Push notifications are on for this device.",
    "subscription-error":
      "This browser is subscribed, but the server could not register this device.",
    "not-configured": "Push notifications have not been configured for this deployment.",
  }[pushStatus];

  const canEnablePush = pushStatus === "unsubscribed";

  return (
    <div className="space-y-6 border-t pt-5">
      <section className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-medium">
            <Bell className="size-5" />
            Push notifications
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable reminders on each device where you want to receive them.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">This device</p>
              <p className="text-sm text-muted-foreground">{pushStatusCopy}</p>
            </div>
          </div>

          {pushSubscription ? (
            <Button
              type="button"
              variant="outline"
              onClick={disablePush}
              disabled={changingPushStatus}
            >
              {changingPushStatus ? <LoaderCircle className="animate-spin" /> : <BellOff />}
              Disable
            </Button>
          ) : (
            <Button
              type="button"
              onClick={enablePush}
              disabled={!canEnablePush || changingPushStatus}
            >
              {changingPushStatus ? <LoaderCircle className="animate-spin" /> : <Bell />}
              Enable
            </Button>
          )}
        </div>

        {isIOS && !isStandalone ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
            On iPhone or iPad, first use the browser Share menu to add Goalmaxxing to your Home
            Screen. Then open Goalmaxxing from its Home Screen icon and enable notifications here.
          </div>
        ) : null}

        {pushStatus === "denied" ? (
          <p className="text-sm text-muted-foreground">
            Open your device&apos;s notification settings, allow notifications for Goalmaxxing,
            then return here.
          </p>
        ) : null}
      </section>

      <section className="space-y-5 border-t pt-5">
        <div>
          <h3 className="flex items-center gap-2 text-base font-medium">
            <Clock3 className="size-5" />
            Daily reminders
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A {formatHour(DEFAULT_NOTIFICATION_HOUR)} reminder is enabled by default in your local
            timezone. Disable it below or add more reminders. New reminders use {timezone}.
          </p>
        </div>
        <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="notification-hour">Time</Label>
            <Select value={hour} onValueChange={setHour}>
              <SelectTrigger id="notification-hour" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, value) => (
                  <SelectItem key={value} value={String(value)}>
                    {formatHour(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notification-message">Message</Label>
            <Input
              id="notification-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={180}
              placeholder={DEFAULT_MESSAGE}
            />
          </div>

          <Button
            type="button"
            onClick={addSchedule}
            disabled={savingSchedule || !message.trim() || !userId}
          >
            {savingSchedule ? <LoaderCircle className="animate-spin" /> : <Plus />}
            Add
          </Button>
        </div>

        {loadingSchedules ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoaderCircle className="mr-2 animate-spin" />
            Loading reminders…
          </div>
        ) : schedules.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No daily reminders yet.
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((schedule) => {
              const pending = pendingScheduleId === schedule.id;

              return (
                <div
                  key={schedule.id}
                  className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-28">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{formatHour(schedule.hour)}</p>
                      {schedule.is_default ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{schedule.timezone}</p>
                  </div>
                  <p
                    className={`flex-1 text-sm ${
                      schedule.enabled ? "" : "text-muted-foreground line-through"
                    }`}
                  >
                    {schedule.message}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleSchedule(schedule)}
                      disabled={pending}
                    >
                      {schedule.enabled ? <BellOff /> : <Bell />}
                      {getScheduleToggleLabel(schedule)}
                    </Button>
                    {!schedule.is_default ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        aria-label={`Delete ${formatHour(schedule.hour)} reminder`}
                        onClick={() => deleteSchedule(schedule)}
                        disabled={pending}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
