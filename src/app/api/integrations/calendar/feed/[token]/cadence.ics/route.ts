import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePlannerEffectiveScheduledTime } from "@/lib/planner/schedule-time";
import { getServerEnv } from "@/lib/env";
import {
  buildPlannerCalendarIcs,
  createIcsEtag,
  type PlannerCalendarFeedItem,
} from "@/lib/integrations/calendar/ics";
import {
  readCalendarFeedTokenUserId,
  verifyCalendarFeedToken,
} from "@/lib/integrations/calendar/feed-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const tokenSchema = z.object({ token: z.string().min(1).max(512) });

function matchEtag(ifNoneMatchHeader: string | null, etag: string) {
  if (!ifNoneMatchHeader) {
    return false;
  }
  const candidates = ifNoneMatchHeader.split(",").map((part) => part.trim());
  const weakEtag = `W/${etag}`;
  return candidates.some((candidate) => candidate === "*" || candidate === etag || candidate === weakEtag);
}

type PlannerItemRow = {
  goal_id: string;
  unit_key: string;
  scheduled_date: string;
  scheduled_time: string | null;
  goals:
    | {
        title: string;
        default_local_time: string | null;
        is_deleted: boolean;
      }
    | Array<{
        title: string;
        default_local_time: string | null;
        is_deleted: boolean;
      }>;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> | { token: string } }
) {
  const env = getServerEnv();
  if (!env.CALENDAR_FEED_HMAC_KEY) {
    return NextResponse.json(
      {
        code: "calendar_feed_unavailable",
        message: "Calendar feed is not configured.",
      },
      { status: 503 }
    );
  }

  const resolvedParams = await context.params;
  const parsedParams = tokenSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = parsedParams.data.token;
  const userId = readCalendarFeedTokenUserId(token);
  if (!userId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const profileResponse = await admin
    .from("profiles")
    .select("calendar_feed_token_version")
    .eq("id", userId)
    .maybeSingle();

  if (profileResponse.error || !profileResponse.data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const verifiedUserId = verifyCalendarFeedToken({
    token,
    version: profileResponse.data.calendar_feed_token_version,
    hmacKey: env.CALENDAR_FEED_HMAC_KEY,
  });
  if (!verifiedUserId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const itemsResponse = await admin
    .from("planner_items")
    .select(
      "goal_id,unit_key,scheduled_date,scheduled_time,goals!inner(title,default_local_time,is_deleted)"
    )
    .eq("owner_id", verifiedUserId)
    .eq("goals.is_deleted", false)
    .order("scheduled_date", { ascending: true })
    .order("goal_id", { ascending: true })
    .order("unit_key", { ascending: true });

  if (itemsResponse.error) {
    return NextResponse.json(
      {
        code: "calendar_feed_load_failed",
        message: "Calendar feed could not be loaded.",
      },
      { status: 500 }
    );
  }

  const feedItems: PlannerCalendarFeedItem[] = ((itemsResponse.data ??
    []) as PlannerItemRow[]).map((row) => {
    const goal = Array.isArray(row.goals) ? row.goals[0] : row.goals;
    const scheduled = resolvePlannerEffectiveScheduledTime({
      scheduledDate: row.scheduled_date,
      goalDefaultLocalTime: goal?.default_local_time ?? null,
      scheduledTimeOverride: row.scheduled_time,
    });
    return {
      goalId: row.goal_id,
      unitKey: row.unit_key,
      scheduledDate: row.scheduled_date,
      scheduledTimeOverride: scheduled.scheduledTimeOverride,
      goalDefaultLocalTime: scheduled.goalDefaultLocalTime,
      goalTitle: goal?.title ?? "Cadence Goal",
    };
  });

  const body = buildPlannerCalendarIcs({
    generatedAt: new Date(),
    items: feedItems,
  });
  const etag = createIcsEtag(body);

  if (matchEtag(request.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=900",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cadence.ics"',
      "Cache-Control": "private, max-age=900",
      "X-Robots-Tag": "noindex",
      ETag: etag,
    },
  });
}
