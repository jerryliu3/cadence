import { z } from "zod";
import { HEALTH_METRIC_KEYS } from "@cadence/shared/health/providers";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { reportHealthDiagnostic } from "@/lib/health/diagnostics";
import {
  requireIntegrationsAccess,
  requireIntegrationsFlag,
} from "@/lib/health/integrations-disabled";
import {
  toHealthAutocompleteRuleStatuses,
  type HealthAutocompleteRuleRow,
} from "@/lib/health/status-payload";

export const runtime = "nodejs";

const upsertSchema = z.object({
  goalId: z.string().uuid(),
  metricKey: z.enum(HEALTH_METRIC_KEYS),
  thresholdNumeric: z.number().min(0).max(1_000_000_000),
  enabled: z.boolean().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function PUT(request: Request) {
  return withRoute(async ({ correlationId }) => {
    requireIntegrationsFlag();

    const payload = await parseJsonBody({
      request,
      schema: upsertSchema,
    });
    const { userId, supabase } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to update auto-complete rules.",
    });
    requireIntegrationsAccess(userId);

    const rpcResponse = await supabase.rpc(
      "upsert_health_autocomplete_rule_service",
      {
        p_goal_id: payload.goalId,
        p_metric_key: payload.metricKey,
        p_threshold_numeric: payload.thresholdNumeric,
        p_enabled: payload.enabled ?? true,
      }
    );
    if (rpcResponse.error) {
      throw new ApiRouteError(
        500,
        "health_autocomplete_rule_failed",
        "Auto-complete rule could not be saved."
      );
    }

    const row = rpcResponse.data as HealthAutocompleteRuleRow | null;
    if (!row?.id || !row.goal_id || !row.metric_key) {
      throw new ApiRouteError(
        500,
        "health_autocomplete_rule_failed",
        "Auto-complete rule could not be saved."
      );
    }

    reportHealthDiagnostic({
      event: "autocomplete_rule",
      correlationId,
    });

    return apiSuccessResponse(
      {
        schemaVersion: "1" as const,
        rule: toHealthAutocompleteRuleStatuses([row])[0],
      },
      correlationId
    );
  });
}

export async function DELETE(request: Request) {
  return withRoute(async ({ correlationId }) => {
    requireIntegrationsFlag();

    const parsed = deleteSchema.safeParse({
      id: new URL(request.url).searchParams.get("id"),
    });
    if (!parsed.success) {
      throw new ApiRouteError(
        400,
        "invalid_autocomplete_rule",
        "A rule id is required."
      );
    }
    const { userId, supabase } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to update auto-complete rules.",
    });
    requireIntegrationsAccess(userId);

    const rpcResponse = await supabase.rpc(
      "delete_health_autocomplete_rule_service",
      { p_rule_id: parsed.data.id }
    );
    if (rpcResponse.error) {
      throw new ApiRouteError(
        500,
        "health_autocomplete_rule_failed",
        "Auto-complete rule could not be deleted."
      );
    }

    return apiSuccessResponse(
      {
        schemaVersion: "1" as const,
        deleted: Boolean(rpcResponse.data),
      },
      correlationId
    );
  });
}
