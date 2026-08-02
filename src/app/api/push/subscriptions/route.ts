import { NextResponse } from "next/server";
import { z } from "zod";
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

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: user.id,
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
      return NextResponse.json({ error: "Could not save this device." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscription configuration error:", error);
    return NextResponse.json(
      { error: "Push notifications are not configured on the server." },
      { status: 503 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", parsed.data.endpoint);

    if (error) {
      console.error("Failed to delete push subscription:", error);
      return NextResponse.json({ error: "Could not remove this device." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscription configuration error:", error);
    return NextResponse.json(
      { error: "Push notifications are not configured on the server." },
      { status: 503 }
    );
  }
}
