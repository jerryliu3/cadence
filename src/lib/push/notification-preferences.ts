import {
  normalizeNotificationPreferences,
  type NotificationPreferences,
} from "@cadence/shared/notifications/preferences";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function loadNotificationPreferencesByUserIds({
  admin,
  userIds,
}: {
  admin: AdminClient;
  userIds: string[];
}) {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((userId) => userId.length > 0))
  );

  if (uniqueUserIds.length === 0) {
    return new Map<string, NotificationPreferences>();
  }

  const preferencesByUserId = new Map<string, NotificationPreferences>();

  const { data, error } = await admin
    .from("profiles")
    .select("id,notification_preferences")
    .in("id", uniqueUserIds);

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    preferencesByUserId.set(
      row.id,
      normalizeNotificationPreferences(row.notification_preferences)
    );
  }

  return preferencesByUserId;
}
