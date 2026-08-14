import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { getDateInTimezone, resolveUserTimezone } from "@/lib/dates/timezone";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const importSchema = z.object({
  provider: z.enum(["garmin", "google_health_connect", "apple_healthkit"]),
  dailyRollups: z
    .array(
      z.object({
        day: z.iso.date(),
        steps: z.number().int().nonnegative().optional(),
        activeMinutes: z.number().int().nonnegative().optional(),
        workoutCount: z.number().int().nonnegative().optional(),
        sourceHash: z.string().trim().min(1).max(128),
      })
    )
    .min(1)
    .max(800),
  autoCompletions: z
    .array(
      z.object({
        goalId: z.uuid(),
        completedOn: z.iso.date(),
        externalKey: z.string().trim().min(1).max(128).optional(),
      })
    )
    .max(200)
    .optional(),
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
      schema: importSchema,
      maxBytes: 512 * 1024,
    });
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to sync health data.",
    });
    const admin = createAdminClient();

    const rollupRows = payload.dailyRollups.map((rollup) => ({
      user_id: userId,
      provider: payload.provider,
      day: rollup.day,
      steps: rollup.steps ?? null,
      active_minutes: rollup.activeMinutes ?? null,
      workout_count: rollup.workoutCount ?? null,
      source_hash: rollup.sourceHash,
    }));

    const upsertRollupsResponse = await admin
      .from("integration_health_daily_rollups")
      .upsert(rollupRows, { onConflict: "user_id,provider,day" });

    if (upsertRollupsResponse.error) {
      throw new ApiRouteError(500, "health_import_failed", "Health data could not be imported.");
    }

    let appliedCompletionCount = 0;
    if (payload.autoCompletions && payload.autoCompletions.length > 0) {
      const profileResponse = await supabase
        .from("profiles")
        .select("timezone")
        .eq("id", userId)
        .maybeSingle();
      if (profileResponse.error) {
        throw new ApiRouteError(
          500,
          "health_import_failed",
          "Health data could not be imported."
        );
      }

      const timezone = resolveUserTimezone(profileResponse.data?.timezone);
      const now = new Date();
      const allowedDays = new Set([
        getDateInTimezone(now, timezone),
        getDateInTimezone(new Date(now.getTime() - 86_400_000), timezone),
      ]);

      for (const completion of payload.autoCompletions) {
        if (!allowedDays.has(completion.completedOn)) {
          continue;
        }
        const rpcResponse = await supabase.rpc("apply_external_completion_service", {
          p_goal_id: completion.goalId,
          p_completed_on: completion.completedOn,
          p_provider: payload.provider,
          p_external_key: completion.externalKey,
        });
        if (rpcResponse.error) {
          throw new ApiRouteError(
            500,
            "health_completion_sync_failed",
            "Health completions could not be applied."
          );
        }
        if (rpcResponse.data) {
          appliedCompletionCount += 1;
        }
      }
    }

    const [touchConnectionResponse, syncRunResponse] = await Promise.all([
      admin
        .from("oauth_connections")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("provider", payload.provider),
      admin.from("integration_sync_runs").insert({
        user_id: userId,
        provider: payload.provider,
        sync_kind: "health_pull",
        status: "ok",
        detail: {
          imported_days: payload.dailyRollups.length,
          applied_completions: appliedCompletionCount,
        },
      }),
    ]);

    if (touchConnectionResponse.error || syncRunResponse.error) {
      throw new ApiRouteError(
        500,
        "health_import_failed",
        "Health sync metadata could not be saved."
      );
    }

    return apiSuccessResponse(
      {
        importedDays: payload.dailyRollups.length,
        appliedCompletions: appliedCompletionCount,
      },
      correlationId
    );
  });
}
