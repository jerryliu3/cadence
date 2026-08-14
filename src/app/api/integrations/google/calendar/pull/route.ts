import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const pullSchema = z.object({
  days: z
    .array(
      z.object({
        day: z.iso.date(),
        busyMinutes: z.number().int().min(0).max(1440),
        sourceHash: z.string().trim().min(1).max(128),
      })
    )
    .min(1)
    .max(400),
});

function disabledError() {
  return new ApiRouteError(
    503,
    "integrations_disabled",
    "Integrations are not enabled."
  );
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("integrationsEnabled")) {
      throw disabledError();
    }

    const payload = await parseJsonBody({
      request,
      schema: pullSchema,
      maxBytes: 256 * 1024,
    });
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to sync calendar data.",
    });
    const admin = createAdminClient();

    const rows = payload.days.map((day) => ({
      user_id: userId,
      provider: "google_calendar",
      day: day.day,
      busy_minutes: day.busyMinutes,
      source_hash: day.sourceHash,
    }));

    const [upsertResponse, touchConnectionResponse, syncRunResponse] =
      await Promise.all([
        admin
          .from("integration_calendar_busy_days")
          .upsert(rows, { onConflict: "user_id,provider,day" }),
        admin
          .from("oauth_connections")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("provider", "google_calendar"),
        admin.from("integration_sync_runs").insert({
          user_id: userId,
          provider: "google_calendar",
          sync_kind: "calendar_pull",
          status: "ok",
          detail: {
            imported_days: payload.days.length,
          },
        }),
      ]);

    if (upsertResponse.error || touchConnectionResponse.error || syncRunResponse.error) {
      throw new ApiRouteError(
        500,
        "calendar_pull_failed",
        "Calendar pull sync failed."
      );
    }

    return apiSuccessResponse(
      {
        importedDays: payload.days.length,
      },
      correlationId
    );
  });
}
