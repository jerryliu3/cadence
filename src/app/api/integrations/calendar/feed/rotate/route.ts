import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { getServerEnv } from "@/lib/env";
import { createCalendarFeedToken } from "@/lib/integrations/calendar/feed-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const env = getServerEnv();
    if (!env.CALENDAR_FEED_HMAC_KEY) {
      throw new ApiRouteError(
        503,
        "calendar_feed_unavailable",
        "Calendar feed is not configured."
      );
    }

    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to rotate your calendar feed URL.",
    });

    const admin = createAdminClient();
    const profileResponse = await admin
      .from("profiles")
      .select("calendar_feed_token_version")
      .eq("id", userId)
      .maybeSingle();

    if (profileResponse.error || !profileResponse.data) {
      throw new ApiRouteError(
        500,
        "calendar_feed_rotation_failed",
        "Calendar feed URL could not be rotated."
      );
    }

    const nextVersion = profileResponse.data.calendar_feed_token_version + 1;
    const updateResponse = await admin
      .from("profiles")
      .update({ calendar_feed_token_version: nextVersion })
      .eq("id", userId)
      .select("calendar_feed_token_version")
      .single();

    if (updateResponse.error || !updateResponse.data) {
      throw new ApiRouteError(
        500,
        "calendar_feed_rotation_failed",
        "Calendar feed URL could not be rotated."
      );
    }

    const tokenVersion = updateResponse.data.calendar_feed_token_version;
    const token = createCalendarFeedToken({
      userId,
      version: tokenVersion,
      hmacKey: env.CALENDAR_FEED_HMAC_KEY,
    });

    const requestOrigin = new URL(request.url).origin;
    const appBaseUrl = env.NEXT_PUBLIC_APP_URL ?? requestOrigin;
    const feedUrl = new URL(
      `/api/integrations/calendar/feed/${token}/cadence.ics`,
      appBaseUrl
    ).toString();

    return apiSuccessResponse(
      {
        token,
        tokenVersion,
        feedUrl,
      },
      correlationId
    );
  });
}
