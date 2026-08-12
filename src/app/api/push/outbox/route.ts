import { NextResponse } from "next/server";
import { flushNotificationOutbox } from "@/lib/push/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return unauthorizedResponse();
  }

  try {
    const result = await flushNotificationOutbox({ limit: 100 });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Outbox push dispatch failed:", error);
    return NextResponse.json({ error: "Outbox dispatch failed." }, { status: 500 });
  }
}
