import webpush from "web-push";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
  tag?: string | null;
  icon?: string | null;
  badge?: string | null;
}

let isVapidConfigured = false;

function isExpiredSubscriptionError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return false;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

export function configureWebPush() {
  if (isVapidConfigured) {
    return;
  }

  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();

  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      "VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY are required."
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  isVapidConfigured = true;
}

export async function sendPushToUser({
  admin,
  userId,
  payload,
  ttlSeconds = 60 * 60,
  urgency = "normal",
}: {
  admin: AdminClient;
  userId: string;
  payload: PushPayload;
  ttlSeconds?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}) {
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  if (subscriptions.length === 0) {
    return {
      sent: 0,
      removedSubscriptions: 0,
      hadSubscriptions: false,
    };
  }

  let sent = 0;
  const expiredIds = new Set<string>();
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          icon: payload.icon ?? "/cadence-icon.svg",
          badge: payload.badge ?? "/cadence-icon.svg",
          tag: payload.tag ?? `cadence-${userId}`,
          url: payload.url ?? "/",
        }),
        {
          TTL: ttlSeconds,
          urgency,
        }
      );
      sent += 1;
    } catch (sendError) {
      if (isExpiredSubscriptionError(sendError)) {
        expiredIds.add(subscription.id);
      } else {
        throw sendError;
      }
    }
  }

  if (expiredIds.size > 0) {
    const { error: cleanupError } = await admin
      .from("push_subscriptions")
      .delete()
      .in("id", Array.from(expiredIds));
    if (cleanupError) {
      console.error("Failed to clean up expired push subscriptions:", cleanupError);
    }
  }

  return {
    sent,
    removedSubscriptions: expiredIds.size,
    hadSubscriptions: subscriptions.length > 0,
  };
}
