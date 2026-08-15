import webpush from "web-push";
import { getServerEnv } from "@/lib/env";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  platform?: "web" | "ios" | "android" | null;
  native_token?: string | null;
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
  return statusCode === 403 || statusCode === 404 || statusCode === 410;
}

function tryConfigureWebPush() {
  if (isVapidConfigured) {
    return true;
  }

  const env = getServerEnv();
  const subject = env.VAPID_SUBJECT?.trim();
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();

  if (!subject || !publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  isVapidConfigured = true;
  return true;
}

export function configureWebPush() {
  if (!tryConfigureWebPush()) {
    throw new Error(
      "VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY are required."
    );
  }
}

export function resetWebPushConfigurationForTests() {
  isVapidConfigured = false;
}

interface ExpoPushTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

export function readExpoPushTickets(payload: unknown): ExpoPushTicket[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) {
    return data.filter(
      (ticket): ticket is ExpoPushTicket =>
        Boolean(ticket) && typeof ticket === "object"
    );
  }
  if (data && typeof data === "object") {
    return [data as ExpoPushTicket];
  }
  return [];
}

export function isExpiredExpoPushTicket(ticket: ExpoPushTicket) {
  return (
    ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
  );
}

async function sendNativePush(token: string, payload: PushPayload) {
  const env = getServerEnv();
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(env.EXPO_ACCESS_TOKEN
        ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      to: token,
      title: payload.title,
      body: payload.body,
      sound: "default",
      data: {
        url: payload.url ?? "/checklist",
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404 || response.status === 410) {
    return { sent: false, expired: true };
  }

  const body = await response.json().catch(() => null);
  const tickets = readExpoPushTickets(body);
  if (tickets.some(isExpiredExpoPushTicket)) {
    return { sent: false, expired: true };
  }
  if (!response.ok) {
    throw new Error(`Expo push failed with status ${response.status}.`);
  }
  if (tickets.some((ticket) => ticket.status === "error")) {
    const message = tickets
      .map((ticket) => ticket.message)
      .filter((value): value is string => Boolean(value))
      .join("; ");
    throw new Error(message || "Expo push ticket returned an error.");
  }
  return { sent: true, expired: false };
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
    .select("id,endpoint,p256dh,auth,platform,native_token")
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
      webConfigurationUnavailable: false,
      deliveryFailures: 0,
    };
  }

  let sent = 0;
  let webConfigurationUnavailable = false;
  let deliveryFailures = 0;
  const expiredIds = new Set<string>();
  for (const subscription of subscriptions) {
    try {
      if (subscription.platform === "ios" || subscription.platform === "android") {
        const token = subscription.native_token?.trim();
        if (!token) {
          expiredIds.add(subscription.id);
          continue;
        }
        const result = await sendNativePush(token, payload);
        if (result.expired) {
          expiredIds.add(subscription.id);
          continue;
        }
        if (result.sent) {
          sent += 1;
        }
        continue;
      }

      let webPushConfigured = false;
      try {
        webPushConfigured = tryConfigureWebPush();
      } catch (configurationError) {
        webConfigurationUnavailable = true;
        console.error("Web push VAPID configuration is invalid.", configurationError);
        continue;
      }
      if (!webPushConfigured) {
        webConfigurationUnavailable = true;
        console.error(
          "Skipping web push subscription because VAPID keys are not configured."
        );
        continue;
      }

      if (!subscription.p256dh || !subscription.auth) {
        expiredIds.add(subscription.id);
        continue;
      }

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
        continue;
      }
      deliveryFailures += 1;
      console.error(
        `Failed to send push to subscription ${subscription.id}:`,
        sendError
      );
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
    webConfigurationUnavailable,
    deliveryFailures,
  };
}
