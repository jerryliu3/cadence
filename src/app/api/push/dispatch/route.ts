import { ApiRouteError, apiSuccessResponse, withRoute } from "@/lib/api/route";
import { getServerEnv } from "@/lib/env";
import { defaultNotificationPreferences } from "@cadence/shared/notifications/preferences";
import { loadNotificationPreferencesByUserIds } from "@/lib/push/notification-preferences";
import { sendPushToUser } from "@/lib/push/send";
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

type AdminClient = ReturnType<typeof createAdminClient>;

async function releaseScheduleClaim({
  admin,
  schedule,
  localDate,
}: {
  admin: AdminClient;
  schedule: NotificationSchedule;
  localDate: string;
}) {
  return admin
    .from("notification_schedules")
    .update({
      last_sent_local_date: schedule.last_sent_local_date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schedule.id)
    .eq("last_sent_local_date", localDate);
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
    throw new ApiRouteError(
      401,
      "cron_auth_invalid",
      "Unauthorized cron request."
    );
  }

  try {
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
          localSlot.hour < schedule.hour ||
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
      return apiSuccessResponse(
        { due: 0, sent: 0, deferred: 0, skipped: 0, removedSubscriptions: 0 },
        correlationId
      );
    }

    let skipped = 0;
    let preferenceFilteredCandidates = dueCandidates;
    try {
      const preferencesByUserId = await loadNotificationPreferencesByUserIds({
        admin,
        userIds: dueCandidates.map(({ schedule }) => schedule.user_id),
      });
      preferenceFilteredCandidates = dueCandidates.filter(({ schedule }) => {
        const preferences =
          preferencesByUserId.get(schedule.user_id) ??
          defaultNotificationPreferences;
        if (preferences.daily_reminders) {
          return true;
        }
        skipped += 1;
        return false;
      });
    } catch (error) {
      // Fail open here: claiming already-due reminders is safer than dropping a day.
      console.error("Failed to load reminder preferences before dispatch:", error);
    }

    if (preferenceFilteredCandidates.length === 0) {
      return apiSuccessResponse(
        { due: 0, sent: 0, deferred: 0, skipped, removedSubscriptions: 0 },
        correlationId
      );
    }

    const claimedSchedules = await Promise.all(
      preferenceFilteredCandidates.map(async ({ schedule, localDate }) => {
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
      return apiSuccessResponse(
        { due: 0, sent: 0, deferred: 0, skipped, removedSubscriptions: 0 },
        correlationId
      );
    }

    let sent = 0;
    let deferred = 0;
    let removedSubscriptions = 0;

    await Promise.all(
      dueSchedules.map(async ({ schedule, localDate }) => {
        let retryableFailure = false;
        try {
          const result = await sendPushToUser({
            admin,
            userId: schedule.user_id,
            payload: {
              title: "Goalmaxxing",
              body: schedule.message,
              url: "/app",
              tag: `cadence-${schedule.id}-${localDate}`,
            },
          });
          sent += result.sent;
          removedSubscriptions += result.removedSubscriptions;
          retryableFailure =
            result.sent === 0 &&
            (result.webConfigurationUnavailable ||
              result.deliveryFailures > 0);
        } catch (error) {
          retryableFailure = true;
          console.error(`Failed to send schedule ${schedule.id}:`, error);
        }

        if (!retryableFailure) {
          return;
        }

        const { error: releaseError } = await releaseScheduleClaim({
          admin,
          schedule,
          localDate,
        });
        if (releaseError) {
          throw releaseError;
        }
        deferred += 1;
      })
    );

    return apiSuccessResponse(
      {
        due: dueSchedules.length,
        sent,
        deferred,
        skipped,
        removedSubscriptions,
      },
      correlationId
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }
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
