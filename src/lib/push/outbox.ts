import { createAdminClient } from "@/lib/supabase/admin";
import {
  defaultNotificationPreferences,
  getNotificationPreferenceKeyForOutboxKind,
  type NotificationPreferences,
} from "@cadence/shared/notifications/preferences";
import { loadNotificationPreferencesByUserIds } from "@/lib/push/notification-preferences";
import { sendPushToUser } from "@/lib/push/send";

interface ClaimedOutboxRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  attempts: number;
}

export interface OutboxFlushResult {
  claimed: number;
  sent: number;
  failed: number;
  deferred: number;
  skipped: number;
  removedSubscriptions: number;
}

function isNoSubscriptionResult(result: {
  sent: number;
  hadSubscriptions: boolean;
}) {
  return result.sent === 0 && !result.hadSubscriptions;
}

export async function flushNotificationOutbox({
  limit = 50,
}: {
  limit?: number;
} = {}): Promise<OutboxFlushResult> {
  const admin = createAdminClient();
  const clampedLimit = Math.min(Math.max(limit, 1), 200);
  const { data: claimedRows, error: claimError } = await admin.rpc(
    "claim_notification_outbox_service",
    {
      p_limit: clampedLimit,
    }
  );

  if (claimError) {
    throw claimError;
  }
  const resolveDelivery = async ({
    outboxId,
    sent,
    error,
  }: {
    outboxId: string;
    sent: boolean;
    error?: string;
  }) => {
    const { data: resolved, error: resolveError } = await admin.rpc(
      "resolve_notification_outbox_delivery_service",
      {
        p_outbox_id: outboxId,
        p_sent: sent,
        p_error: error,
      }
    );
    if (resolveError) {
      throw resolveError;
    }
    if (!resolved) {
      throw new Error("notification_outbox_resolution_failed");
    }
  };
  const rows = (claimedRows ?? []) as ClaimedOutboxRow[];
  let preferencesByUserId = new Map<string, NotificationPreferences>();
  try {
    preferencesByUserId = await loadNotificationPreferencesByUserIds({
      admin,
      userIds: rows.map((row) => row.user_id),
    });
  } catch (error) {
    console.error("Failed to load notification preferences for outbox flush", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  let skipped = 0;
  let removedSubscriptions = 0;

  for (const row of rows) {
    const preferenceKey = getNotificationPreferenceKeyForOutboxKind(row.kind);
    if (preferenceKey) {
      const preferences =
        preferencesByUserId.get(row.user_id) ?? defaultNotificationPreferences;
      if (!preferences[preferenceKey]) {
        skipped += 1;
        await resolveDelivery({
          outboxId: row.id,
          sent: false,
          error: "disabled_by_user_preference",
        });
        continue;
      }
    }

    let result: Awaited<ReturnType<typeof sendPushToUser>>;
    try {
      result = await sendPushToUser({
        admin,
        userId: row.user_id,
        payload: {
          title: row.title,
          body: row.body,
          url: row.url,
          tag: `${row.kind}-${row.id}`,
        },
      });
    } catch (error) {
      failed += 1;
      await resolveDelivery({
        outboxId: row.id,
        sent: false,
        error: error instanceof Error ? error.message.slice(0, 400) : "unknown_error",
      });
      continue;
    }

    removedSubscriptions += result.removedSubscriptions;

    if (result.sent === 0 && result.webConfigurationUnavailable) {
      deferred += 1;
      await resolveDelivery({
        outboxId: row.id,
        sent: false,
        error: "web_configuration_unavailable",
      });
      continue;
    }

    if (isNoSubscriptionResult(result)) {
      skipped += 1;
      await resolveDelivery({
        outboxId: row.id,
        sent: false,
        error: "no_subscriptions",
      });
      continue;
    }

    if (result.sent > 0) {
      sent += 1;
      await resolveDelivery({
        outboxId: row.id,
        sent: true,
      });
    } else {
      failed += 1;
      await resolveDelivery({
        outboxId: row.id,
        sent: false,
        error: "send_failed",
      });
    }
  }

  return {
    claimed: rows.length,
    sent,
    failed,
    deferred,
    skipped,
    removedSubscriptions,
  };
}
