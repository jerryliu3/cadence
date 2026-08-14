import { z } from "zod";
import { HEALTH_PROVIDERS } from "@cadence/shared/health/providers";
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

export const runtime = "nodejs";

const disconnectSchema = z.object({
  provider: z.enum(HEALTH_PROVIDERS),
});

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    requireIntegrationsFlag();

    const payload = await parseJsonBody({
      request,
      schema: disconnectSchema,
    });
    const { userId, supabase } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to disconnect health data.",
    });
    requireIntegrationsAccess(userId);

    const rpcResponse = await supabase.rpc("disconnect_health_provider_service", {
      p_provider: payload.provider,
    });
    if (rpcResponse.error) {
      throw new ApiRouteError(
        500,
        "health_disconnect_failed",
        "Health provider data could not be disconnected."
      );
    }

    const result = (rpcResponse.data ?? {}) as {
      deleted_count?: number;
      recomputed_days?: number;
    };

    reportHealthDiagnostic({
      event: "disconnect",
      correlationId,
      provider: payload.provider,
      deletedCount: result.deleted_count ?? 0,
      recomputedDays: result.recomputed_days ?? 0,
    });

    return apiSuccessResponse(
      {
        schemaVersion: "1" as const,
        provider: payload.provider,
        deletedCount: result.deleted_count ?? 0,
        recomputedDays: result.recomputed_days ?? 0,
      },
      correlationId
    );
  });
}
