import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const pushSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    dryRun: z.boolean().optional(),
  })
  .refine((payload) => payload.from <= payload.to, {
    message: "from must be before to",
    path: ["from"],
  });

type PlannerItemRow = {
  goal_id: string;
  unit_key: string;
  scheduled_date: string;
  scheduled_time: string | null;
  goals:
    | {
        title: string;
        default_local_time: string | null;
      }
    | Array<{
        title: string;
        default_local_time: string | null;
      }>;
};

function disabledError() {
  return new ApiRouteError(
    503,
    "integrations_disabled",
    "Integrations are not enabled."
  );
}

function buildDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("integrationsEnabled")) {
      throw disabledError();
    }

    const payload = await parseJsonBody({
      request,
      schema: pushSchema,
      maxBytes: 16 * 1024,
    });
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to sync planner events.",
    });
    const admin = createAdminClient();

    const query = await admin
      .from("planner_items")
      .select(
        "goal_id,unit_key,scheduled_date,scheduled_time,goals!inner(title,default_local_time)"
      )
      .eq("owner_id", userId)
      .gte("scheduled_date", payload.from)
      .lte("scheduled_date", payload.to)
      .order("scheduled_date", { ascending: true });

    if (query.error) {
      throw new ApiRouteError(
        500,
        "calendar_push_projection_failed",
        "Planner events could not be prepared for calendar sync."
      );
    }

    const events = ((query.data ?? []) as PlannerItemRow[]).map((row) => {
      const goal = Array.isArray(row.goals) ? row.goals[0] : row.goals;
      const scheduled = resolvePlannerEffectiveScheduledTime({
        scheduledDate: row.scheduled_date,
        goalDefaultLocalTime: goal?.default_local_time ?? null,
        scheduledTimeOverride: row.scheduled_time,
      });
      const event = {
        externalKey: `${row.goal_id}:${row.unit_key}`,
        title: goal?.title ?? "Cadence Goal",
        day: row.scheduled_date,
        startLocal: scheduled.effectiveScheduledAtLocal,
        durationMinutes: scheduled.effectiveScheduledAtLocal ? 30 : null,
      };
      return {
        ...event,
        digest: buildDigest(event),
      };
    });

    if (!payload.dryRun) {
      const [touchConnectionResponse, syncRunResponse] = await Promise.all([
        admin
          .from("oauth_connections")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("provider", "google_calendar"),
        admin.from("integration_sync_runs").insert({
          user_id: userId,
          provider: "google_calendar",
          sync_kind: "calendar_push",
          status: "ok",
          detail: {
            event_count: events.length,
            from: payload.from,
            to: payload.to,
          },
        }),
      ]);
      if (touchConnectionResponse.error || syncRunResponse.error) {
        throw new ApiRouteError(
          500,
          "calendar_push_record_failed",
          "Calendar push metadata could not be recorded."
        );
      }
    }

    return apiSuccessResponse(
      {
        dryRun: payload.dryRun ?? false,
        events,
        projectionDigest: buildDigest(events),
      },
      correlationId
    );
  });
}
