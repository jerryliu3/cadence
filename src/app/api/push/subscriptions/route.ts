import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(4096),
});

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
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
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
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
        updated_at: new Date().toISOString(),
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
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
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
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", parsed.data.endpoint);

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
