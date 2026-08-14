import { HEALTH_PROVIDERS } from "@cadence/shared/health/providers";
import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { deriveHealthSyncState } from "@/lib/health/sync-state";

export const runtime = "nodejs";

function disabledError() {
  return new ApiRouteError(
    503,
    "integrations_disabled",
    "Integrations are not enabled."
  );
}

export async function GET(request: Request) {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("integrationsEnabled")) {
      throw disabledError();
    }

    const { userId, supabase } = await requireAuthenticatedRequestContext(
      request,
      { unauthorizedMessage: "Sign in to view health sync status." }
    );

    const stateResponse = await supabase
      .from("health_sync_state")
      .select(
        "provider, permission_prompted_at, last_ingest_at, last_sample_at"
      )
      .eq("user_id", userId);

    if (stateResponse.error) {
      throw new ApiRouteError(
        500,
        "health_status_unavailable",
        "Health sync status is unavailable."
      );
    }

    const byProvider = new Map(
      (stateResponse.data ?? []).map((row) => [row.provider, row])
    );

    return apiSuccessResponse(
      {
        schemaVersion: "1" as const,
        providers: HEALTH_PROVIDERS.map((provider) => {
          const row = byProvider.get(provider);
          return {
            provider,
            state: deriveHealthSyncState({
              permissionPromptedAt: row?.permission_prompted_at ?? null,
              lastSampleAt: row?.last_sample_at ?? null,
            }),
            lastIngestAt: row?.last_ingest_at ?? null,
            lastSampleAt: row?.last_sample_at ?? null,
          };
        }),
      },
      correlationId
    );
  });
}
