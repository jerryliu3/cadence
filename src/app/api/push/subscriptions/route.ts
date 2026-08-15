import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";

const webPushEndpointSchema = z
  .string()
  .url()
  .max(4096)
  .refine((endpoint) => new URL(endpoint).protocol === "https:", {
    message: "Web push endpoints must use HTTPS.",
  });

const webSubscriptionSchema = z.object({
  platform: z.literal("web").optional(),
  endpoint: webPushEndpointSchema,
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

const nativeSubscriptionSchema = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().trim().min(8).max(4096),
});

const subscriptionSchema = z.union([
  webSubscriptionSchema,
  nativeSubscriptionSchema,
]);

const unsubscribeSchema = z.union([
  z.object({ endpoint: webPushEndpointSchema }),
  z.object({
    platform: z.enum(["ios", "android"]),
    token: z.string().trim().min(8).max(4096),
  }),
]);

function requirePushAdminClient() {
  try {
    return createAdminClient();
  } catch (error) {
    throw new ApiRouteError(
      503,
      "push_configuration_invalid",
      "Push notifications are not configured on the server.",
      undefined,
      error
    );
  }
}

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Unauthorized.",
    });
    const parsed = await parseJsonBody({
      request,
      schema: subscriptionSchema,
      maxBytes: 16 * 1024,
    });
    const admin = requirePushAdminClient();
    const userAgent = request.headers.get("user-agent")?.slice(0, 1000) ?? null;
    const updatedAt = new Date().toISOString();
    const { error } =
      "token" in parsed
        ? await admin.rpc("replace_native_push_subscription_service", {
            p_user_id: userId,
            p_platform: parsed.platform,
            p_native_token: parsed.token,
            p_endpoint: `native:${parsed.platform}:${parsed.token}`,
            p_user_agent: userAgent ?? undefined,
            p_updated_at: updatedAt,
          })
        : await admin.from("push_subscriptions").upsert(
            {
              user_id: userId,
              platform: "web",
              native_token: null,
              endpoint: parsed.endpoint,
              p256dh: parsed.keys.p256dh,
              auth: parsed.keys.auth,
              user_agent: userAgent,
              updated_at: updatedAt,
            },
            { onConflict: "endpoint" }
          );

    if (error) {
      console.error("Failed to save push subscription:", error);
      throw new ApiRouteError(
        500,
        "push_subscription_upsert_failed",
        "Could not save this device.",
        undefined,
        error
      );
    }

    return apiSuccessResponse({ success: true }, correlationId);
  });
}

export async function DELETE(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Unauthorized.",
    });
    const parsed = await parseJsonBody({
      request,
      schema: unsubscribeSchema,
      maxBytes: 16 * 1024,
    });
    const admin = requirePushAdminClient();
    const endpoint =
      "endpoint" in parsed
        ? parsed.endpoint
        : `native:${parsed.platform}:${parsed.token}`;
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);

    if (error) {
      console.error("Failed to delete push subscription:", error);
      throw new ApiRouteError(
        500,
        "push_subscription_delete_failed",
        "Could not remove this device.",
        undefined,
        error
      );
    }

    return apiSuccessResponse({ success: true }, correlationId);
  });
}
