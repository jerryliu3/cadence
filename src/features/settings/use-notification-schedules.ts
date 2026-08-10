"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import type { createClient } from "@/lib/supabase/client";
import {
  formatHour,
  sortSchedules,
  type NotificationSchedule,
} from "@/features/settings/notification-schedule-utils";

interface UseNotificationSchedulesArgs {
  supabase: ReturnType<typeof createClient>;
  defaultNotificationHour: number;
  defaultMessage: string;
}

export function useNotificationSchedules({
  supabase,
  defaultNotificationHour,
  defaultMessage,
}: UseNotificationSchedulesArgs) {
  const [userId, setUserId] = useState("");
  const [schedules, setSchedules] = useState<NotificationSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null);
  const [hour, setHour] = useState("18");
  const [message, setMessage] = useState(defaultMessage);
  const [timezone, setTimezone] = useState("UTC");

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
          schedule.hour === defaultNotificationHour && schedule.message === defaultMessage
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
            hour: defaultNotificationHour,
            timezone: detectedTimezone,
            message: defaultMessage,
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
        console.error(
          "Failed to create the default notification schedule:",
          defaultScheduleError
        );
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
  }, [defaultMessage, defaultNotificationHour, supabase]);

  const addSchedule = useCallback(async () => {
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
      setSchedules((current) => sortSchedules([...current, data as NotificationSchedule]));
      setMessage(defaultMessage);
      toast.success(`Daily reminder added for ${formatHour(Number(hour))}.`);
    }

    setSavingSchedule(false);
  }, [defaultMessage, hour, message, supabase, timezone, userId]);

  const toggleSchedule = useCallback(
    async (schedule: NotificationSchedule) => {
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
    },
    [supabase, userId]
  );

  const deleteSchedule = useCallback(
    async (schedule: NotificationSchedule) => {
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
    },
    [supabase, userId]
  );

  return {
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
  };
}
