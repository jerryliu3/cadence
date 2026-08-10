import webpush from "web-push";
import { ApiRouteError, apiSuccessResponse, withRoute } from "@/lib/api/route";
import { getServerEnv } from "@/lib/env";
import { reportError } from "@/lib/observability/report-error";
import { getLocalScheduleSlot } from "@/lib/push/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NotificationSchedule {
  id: string;
  user_id: string;
  hour: number;
  timezone: string;
  message: string;
  last_sent_local_date: string | null;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function isExpiredSubscriptionError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return false;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

function configureWebPush() {
  const env = getServerEnv();
  const subject = env.VAPID_SUBJECT;
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      "VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY are required."
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

async function dispatchNotifications(request: Request, correlationId: string) {
  const cronSecret = getServerEnv().CRON_SECRET;

  if (!cronSecret) {
    throw new ApiRouteError(
      503,
      "push_dispatch_unavailable",
      "Cron is not configured."
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    throw new ApiRouteError(401, "authentication_required", "Unauthorized.");
  }

  try {
    configureWebPush();
    const admin = createAdminClient();
    const now = new Date();
    const { data, error } = await admin
      .from("notification_schedules")
      .select("id,user_id,hour,timezone,message,last_sent_local_date")
      .eq("enabled", true);

    if (error) {
      throw error;
    }

    const dueCandidates = ((data ?? []) as NotificationSchedule[]).flatMap((schedule) => {
      try {
        const localSlot = getLocalScheduleSlot(now, schedule.timezone);

        if (
          localSlot.hour !== schedule.hour ||
          schedule.last_sent_local_date === localSlot.date
        ) {
          return [];
        }

        return [{ schedule, localDate: localSlot.date }];
      } catch (error) {
        console.error(`Invalid timezone on notification schedule ${schedule.id}:`, error);
        return [];
      }
    });

    if (dueCandidates.length === 0) {
      return apiSuccessResponse({ due: 0, sent: 0, removedSubscriptions: 0 }, correlationId);
    }

    const claimedSchedules = await Promise.all(
      dueCandidates.map(async ({ schedule, localDate }) => {
        const { data: claimed, error: claimError } = await admin
          .from("notification_schedules")
          .update({
            last_sent_local_date: localDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", schedule.id)
          .or(`last_sent_local_date.is.null,last_sent_local_date.neq.${localDate}`)
          .select("id")
          .maybeSingle();

        if (claimError) {
          throw claimError;
        }

        return claimed ? { schedule, localDate } : null;
      })
    );
    const dueSchedules = claimedSchedules.filter(
      (claimed): claimed is { schedule: NotificationSchedule; localDate: string } =>
        claimed !== null
    );

    if (dueSchedules.length === 0) {
      return apiSuccessResponse({ due: 0, sent: 0, removedSubscriptions: 0 }, correlationId);
    }

    const dueUserIds = Array.from(
      new Set(dueSchedules.map(({ schedule }) => schedule.user_id))
    );
    const { data: subscriptionData, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .in("user_id", dueUserIds);

    if (subscriptionError) {
      throw subscriptionError;
    }

    const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();

    for (const subscription of (subscriptionData ?? []) as PushSubscriptionRow[]) {
      const current = subscriptionsByUser.get(subscription.user_id) ?? [];
      current.push(subscription);
      subscriptionsByUser.set(subscription.user_id, current);
    }

    const expiredSubscriptionIds = new Set<string>();
    let sent = 0;

    await Promise.all(
      dueSchedules.map(async ({ schedule, localDate }) => {
        const subscriptions = subscriptionsByUser.get(schedule.user_id) ?? [];

        await Promise.all(
          subscriptions.map(async (subscription) => {
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
                  title: "Goalmaxxing",
                  body: schedule.message,
                  icon: "/cadence-icon.svg",
                  badge: "/cadence-icon.svg",
                  tag: `cadence-${schedule.id}-${localDate}`,
                  url: "/",
                }),
                {
                  TTL: 60 * 60,
                  urgency: "normal",
                }
              );
              sent += 1;
            } catch (error) {
              if (isExpiredSubscriptionError(error)) {
                expiredSubscriptionIds.add(subscription.id);
              } else {
                console.error(
                  `Failed to send schedule ${schedule.id} to subscription ${subscription.id}:`,
                  error
                );
              }
            }
          })
        );
      })
    );

    if (expiredSubscriptionIds.size > 0) {
      const { error: deleteError } = await admin
        .from("push_subscriptions")
        .delete()
        .in("id", Array.from(expiredSubscriptionIds));

      if (deleteError) {
        reportError(deleteError, {
          code: "push_subscription_cleanup_failed",
          status: 500,
        });
        console.error("Failed to remove expired push subscriptions:", deleteError);
      }
    }

    return apiSuccessResponse(
      {
        due: dueSchedules.length,
        sent,
        removedSubscriptions: expiredSubscriptionIds.size,
      },
      correlationId
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }
    reportError(error, {
      code: "push_dispatch_failed",
      status: 500,
      correlationId,
    });
    console.error("Push notification dispatch failed:", error);
    throw new ApiRouteError(
      500,
      "push_dispatch_failed",
      "Push notification dispatch failed.",
      undefined,
      error
    );
  }
}

export async function GET(request: Request) {
  return withRoute(async ({ correlationId }) =>
    dispatchNotifications(request, correlationId)
  );
}

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) =>
    dispatchNotifications(request, correlationId)
  );
}
