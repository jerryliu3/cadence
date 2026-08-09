import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiRouteError,
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

class PushSubscriptionsRouteError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "PushSubscriptionsRouteError";
  }
}

function pushErrorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function handlePushSubscriptionsRouteError(error: unknown) {
  if (error instanceof ApiRouteError && error.code === "authentication_required") {
    return pushErrorResponse(401, "Unauthorized.");
  }
  if (error instanceof PushSubscriptionsRouteError) {
    return pushErrorResponse(error.status, error.message);
  }
  console.error("Push subscription configuration error:", error);
  return pushErrorResponse(
    503,
    "Push notifications are not configured on the server."
  );
}

export async function POST(request: Request) {
  return withRoute(async () => {
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Unauthorized.",
    });
    const parsed = subscriptionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      throw new PushSubscriptionsRouteError(400, "Invalid push subscription.");
    }
    const admin = createAdminClient();
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
      throw new PushSubscriptionsRouteError(500, "Could not save this device.");
    }

    return NextResponse.json({ success: true });
  }, { onError: handlePushSubscriptionsRouteError });
}

export async function DELETE(request: Request) {
  return withRoute(async () => {
    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Unauthorized.",
    });
    const parsed = unsubscribeSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      throw new PushSubscriptionsRouteError(400, "Invalid push subscription.");
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", parsed.data.endpoint);

    if (error) {
      console.error("Failed to delete push subscription:", error);
      throw new PushSubscriptionsRouteError(500, "Could not remove this device.");
    }

    return NextResponse.json({ success: true });
  }, { onError: handlePushSubscriptionsRouteError });
}
