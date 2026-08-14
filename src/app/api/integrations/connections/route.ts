import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { encryptIntegrationToken } from "@/lib/integrations/token-crypto";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const providerSchema = z.enum([
  "google_calendar",
  "garmin",
  "google_health_connect",
  "apple_healthkit",
]);

const upsertConnectionSchema = z.object({
  provider: providerSchema,
  accessToken: z.string().trim().min(1),
  refreshToken: z.string().trim().min(1).optional(),
  tokenExpiresAt: z.iso.datetime().optional(),
  scope: z.array(z.string().trim().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function integrationsDisabledError() {
  return new ApiRouteError(
    503,
    "integrations_disabled",
    "Integrations are not enabled."
  );
}

export const runtime = "nodejs";

export async function GET() {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("integrationsEnabled")) {
      throw integrationsDisabledError();
    }

    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to view integrations.",
    });

    const response = await supabase
      .from("oauth_connections")
      .select(
        "provider,connection_status,last_sync_at,token_expires_at,scope,metadata,created_at,updated_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (response.error) {
      throw new ApiRouteError(
        500,
        "integration_connection_load_failed",
        "Integration connections could not be loaded."
      );
    }

    return apiSuccessResponse(
      {
        connections: (response.data ?? []).map((connection) => ({
          provider: connection.provider,
          status: connection.connection_status,
          lastSyncAt: connection.last_sync_at,
          tokenExpiresAt: connection.token_expires_at,
          scope: connection.scope,
          metadata: connection.metadata,
          createdAt: connection.created_at,
          updatedAt: connection.updated_at,
        })),
      },
      correlationId
    );
  });
}

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("integrationsEnabled")) {
      throw integrationsDisabledError();
    }

    const payload = await parseJsonBody({
      request,
      schema: upsertConnectionSchema,
      maxBytes: 32 * 1024,
    });
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to connect integrations.",
    });
    const admin = createAdminClient();

    const response = await admin
      .from("oauth_connections")
      .upsert(
        {
          user_id: userId,
          provider: payload.provider,
          connection_status: "active",
          access_token_ciphertext: encryptIntegrationToken(payload.accessToken),
          refresh_token_ciphertext: payload.refreshToken
            ? encryptIntegrationToken(payload.refreshToken)
            : null,
          token_expires_at: payload.tokenExpiresAt ?? null,
          scope: payload.scope ?? [],
          metadata: (payload.metadata ?? {}) as Json,
        },
        { onConflict: "user_id,provider" }
      )
      .select(
        "provider,connection_status,last_sync_at,token_expires_at,scope,metadata,created_at,updated_at"
      )
      .single();

    if (response.error || !response.data) {
      throw new ApiRouteError(
        500,
        "integration_connection_save_failed",
        "Integration connection could not be saved."
      );
    }

    return apiSuccessResponse(
      {
        connection: {
          provider: response.data.provider,
          status: response.data.connection_status,
          lastSyncAt: response.data.last_sync_at,
          tokenExpiresAt: response.data.token_expires_at,
          scope: response.data.scope,
          metadata: response.data.metadata,
          createdAt: response.data.created_at,
          updatedAt: response.data.updated_at,
        },
      },
      correlationId
    );
  });
}
