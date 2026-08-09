import { postJson, requestJson } from "@/lib/api/client";
import type { Database } from "@/lib/supabase/database.types";

type NotificationScheduleRow =
  Database["public"]["Tables"]["notification_schedules"]["Row"];

interface NotificationScheduleEnvelope {
  schedule: NotificationScheduleRow;
}

export async function createNotificationSchedule({
  hour,
  timezone,
  message,
  enabled,
  isDefault,
}: {
  hour: number;
  timezone: string;
  message: string;
  enabled?: boolean;
  isDefault?: boolean;
}) {
  const payload = await postJson<
    NotificationScheduleEnvelope,
    {
      hour: number;
      timezone: string;
      message: string;
      enabled?: boolean;
      isDefault?: boolean;
    }
  >("/api/notification-schedules", {
    hour,
    timezone,
    message,
    enabled,
    isDefault,
  });
  return payload.schedule;
}

export async function updateNotificationSchedule({
  id,
  hour,
  timezone,
  message,
  enabled,
  isDefault,
}: {
  id: string;
  hour?: number;
  timezone?: string;
  message?: string;
  enabled?: boolean;
  isDefault?: boolean;
}) {
  const payload = await requestJson<
    NotificationScheduleEnvelope,
    {
      id: string;
      hour?: number;
      timezone?: string;
      message?: string;
      enabled?: boolean;
      isDefault?: boolean;
    }
  >({
    path: "/api/notification-schedules",
    method: "PATCH",
    body: {
      id,
      hour,
      timezone,
      message,
      enabled,
      isDefault,
    },
  });
  return payload.schedule;
}

export async function deleteNotificationSchedule(id: string) {
  await requestJson<{ success: boolean }, { id: string }>({
    path: "/api/notification-schedules",
    method: "DELETE",
    body: { id },
  });
}
