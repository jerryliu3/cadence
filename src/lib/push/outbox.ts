import { createAdminClient } from "@/lib/supabase/admin";
import { configureWebPush, sendPushToUser } from "@/lib/push/send";

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
  userId,
}: {
  limit?: number;
  userId?: string;
} = {}): Promise<OutboxFlushResult> {
  configureWebPush();
  const admin = createAdminClient();
  const clampedLimit = Math.min(Math.max(limit, 1), 200);
  let rows: ClaimedOutboxRow[] = [];

  if (userId) {
    const { data, error } = await admin
      .from("notification_outbox")
      .select("id,user_id,kind,title,body,url,attempts")
      .eq("state", "pending")
      .eq("user_id", userId)
      .lte("available_at", new Date().toISOString())
      .order("available_at", { ascending: true })
      .limit(clampedLimit);
    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as ClaimedOutboxRow[]) {
      const { data: claimed, error: claimError } = await admin
        .from("notification_outbox")
        .update({
          attempts: row.attempts + 1,
          available_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        })
        .eq("id", row.id)
        .eq("state", "pending")
        .select("id,user_id,kind,title,body,url,attempts")
        .maybeSingle();
      if (claimError) {
        throw claimError;
      }
      if (claimed) {
        rows.push(claimed as ClaimedOutboxRow);
      }
    }
  } else {
    const { data: claimedRows, error: claimError } = await admin.rpc(
      "claim_notification_outbox_service",
      {
        p_limit: clampedLimit,
      }
    );

    if (claimError) {
      throw claimError;
    }
    rows = (claimedRows ?? []) as ClaimedOutboxRow[];
  }
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let removedSubscriptions = 0;

  for (const row of rows) {
    try {
      const result = await sendPushToUser({
        admin,
        userId: row.user_id,
        payload: {
          title: row.title,
          body: row.body,
          url: row.url,
          tag: `${row.kind}-${row.id}`,
        },
      });
      removedSubscriptions += result.removedSubscriptions;

      if (isNoSubscriptionResult(result)) {
        skipped += 1;
        await admin.rpc("resolve_notification_outbox_delivery_service", {
          p_outbox_id: row.id,
          p_sent: false,
          p_error: "no_subscriptions",
        });
        continue;
      }

      if (result.sent > 0) {
        sent += 1;
        await admin.rpc("resolve_notification_outbox_delivery_service", {
          p_outbox_id: row.id,
          p_sent: true,
          p_error: undefined,
        });
      } else {
        failed += 1;
        await admin.rpc("resolve_notification_outbox_delivery_service", {
          p_outbox_id: row.id,
          p_sent: false,
          p_error: "send_failed",
        });
      }
    } catch (error) {
      failed += 1;
      await admin.rpc("resolve_notification_outbox_delivery_service", {
        p_outbox_id: row.id,
        p_sent: false,
        p_error: error instanceof Error ? error.message.slice(0, 400) : "unknown_error",
      });
    }
  }

  return {
    claimed: rows.length,
    sent,
    failed,
    skipped,
    removedSubscriptions,
  };
}

export async function flushNotificationsForUser(userId: string, limit = 20) {
  return flushNotificationOutbox({ limit, userId });
}
