import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { requireSocialRouteContext } from "@/lib/social/api";
import { toChallengeDto } from "@/lib/social/dto";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const context = await requireSocialRouteContext(request);

    const { data, error } = await context.supabase.rpc("get_social_challenges");
    if (error) {
      if (error.message === "authentication_required") {
        throw new ApiRouteError(401, "authentication_required", "You must be signed in.");
      }
      throw new ApiRouteError(
        500,
        "social_challenges_unavailable",
        "Challenges are unavailable.",
        { cause: error.message }
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map(toChallengeDto),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Challenge list request failed unexpectedly.",
    ), correlationId);
  }
}
