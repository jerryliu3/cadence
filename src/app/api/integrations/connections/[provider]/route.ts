import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const providerSchema = z.object({
  provider: z.enum([
    "google_calendar",
    "garmin",
    "google_health_connect",
    "apple_healthkit",
  ]),
});

function integrationsDisabledError() {
  return new ApiRouteError(
    503,
    "integrations_disabled",
    "Integrations are not enabled."
  );
}

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ provider: string }> | { provider: string } }
) {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("integrationsEnabled")) {
      throw integrationsDisabledError();
    }

    const params = providerSchema.parse(await context.params);
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to disconnect integrations.",
    });
    const admin = createAdminClient();

    const response = await admin
      .from("oauth_connections")
      .update({
        connection_status: "revoked",
        refresh_token_ciphertext: null,
        metadata: {},
      })
      .eq("user_id", userId)
      .eq("provider", params.provider)
      .select("provider,connection_status")
      .maybeSingle();

    if (response.error) {
      throw new ApiRouteError(
        500,
        "integration_disconnect_failed",
        "Integration could not be disconnected."
      );
    }
    if (!response.data) {
      throw new ApiRouteError(
        404,
        "integration_not_found",
        "Integration connection was not found."
      );
    }

    return apiSuccessResponse(
      {
        provider: response.data.provider,
        status: response.data.connection_status,
      },
      correlationId
    );
  });
}
