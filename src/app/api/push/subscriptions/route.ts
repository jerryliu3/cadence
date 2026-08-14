import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";

const webSubscriptionSchema = z.object({
  platform: z.literal("web").optional(),
  endpoint: z.string().url().max(4096),
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
  z.object({ endpoint: z.string().url().max(4096) }),
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
    const parsed = subscriptionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      throw new ApiRouteError(
        400,
        "validation_failed",
        "Invalid push subscription."
      );
    }
    const admin = requirePushAdminClient();
    const userAgent = request.headers.get("user-agent")?.slice(0, 1000) ?? null;
    const updatedAt = new Date().toISOString();
    const { error } =
      "token" in parsed.data
        ? await admin.from("push_subscriptions").upsert(
            {
              user_id: userId,
              platform: parsed.data.platform,
              native_token: parsed.data.token,
              endpoint: `native:${parsed.data.platform}:${parsed.data.token}`,
              p256dh: null,
              auth: null,
              user_agent: userAgent,
              updated_at: updatedAt,
            },
            { onConflict: "endpoint" }
          )
        : await admin.from("push_subscriptions").upsert(
            {
              user_id: userId,
              platform: "web",
              native_token: null,
              endpoint: parsed.data.endpoint,
              p256dh: parsed.data.keys.p256dh,
              auth: parsed.data.keys.auth,
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

    if (parsed.data.platform === "ios" || parsed.data.platform === "android") {
      const { error: cleanupError } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("platform", parsed.data.platform)
        .neq("endpoint", `native:${parsed.data.platform}:${parsed.data.token}`);
      if (cleanupError) {
        console.error("Failed to replace prior native push token:", cleanupError);
      }
    }

    return apiSuccessResponse({ success: true }, correlationId);
  });
}

export async function DELETE(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Unauthorized.",
    });
    const parsed = unsubscribeSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      throw new ApiRouteError(
        400,
        "validation_failed",
        "Invalid push subscription."
      );
    }
    const admin = requirePushAdminClient();
    const endpoint =
      "endpoint" in parsed.data
        ? parsed.data.endpoint
        : `native:${parsed.data.platform}:${parsed.data.token}`;
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
