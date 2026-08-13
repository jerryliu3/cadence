import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { requireSocialRouteContext } from "@/lib/social/api";
import { toSeasonDto } from "@/lib/social/dto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const correlationId = createCorrelationId();
  try {
    const supabase = await createClient();
    const context = await requireSocialRouteContext({ supabase });

    const { data, error } = await context.supabase.rpc("get_social_leaderboards");
    if (error) {
      if (error.message === "authentication_required") {
        throw new ApiRouteError(401, "authentication_required", "You must be signed in.");
      }
      throw new ApiRouteError(
        500,
        "social_leaderboards_unavailable",
        "Leaderboards are unavailable.",
        { cause: error.message }
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map(toSeasonDto),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Leaderboard list request failed unexpectedly.",
    ), correlationId);
  }
}
