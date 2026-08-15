import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import {
  requireIntegrationsAccess,
  requireIntegrationsFlag,
} from "@/lib/health/integrations-disabled";
import {
  toHealthAutocompleteRuleStatuses,
  toHealthProviderStatuses,
  type HealthAutocompleteRuleRow,
  type HealthSyncStateRow,
} from "@/lib/health/status-payload";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRoute(async ({ correlationId }) => {
    requireIntegrationsFlag();

    const { userId, supabase } = await requireAuthenticatedRequestContext(
      request,
      { unauthorizedMessage: "Sign in to view health sync status." }
    );
    requireIntegrationsAccess(userId);

    const [stateResponse, rulesResponse] = await Promise.all([
      supabase
        .from("health_sync_state")
        .select(
          "provider, permission_prompted_at, last_ingest_at, last_sample_at, last_error"
        )
        .eq("user_id", userId),
      supabase
        .from("health_autocomplete_rules")
        .select("id, goal_id, metric_key, threshold_numeric, enabled")
        .eq("user_id", userId),
    ]);

    if (stateResponse.error || rulesResponse.error) {
      throw new ApiRouteError(
        500,
        "health_status_unavailable",
        "Health sync status is unavailable."
      );
    }

    return apiSuccessResponse(
      {
        schemaVersion: "1" as const,
        providers: toHealthProviderStatuses(
          (stateResponse.data ?? []) as HealthSyncStateRow[]
        ),
        autocompleteRules: toHealthAutocompleteRuleStatuses(
          (rulesResponse.data ?? []) as HealthAutocompleteRuleRow[]
        ),
      },
      correlationId
    );
  });
}
