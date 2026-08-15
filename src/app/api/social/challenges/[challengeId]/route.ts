import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSocialRouteContext } from "@/lib/social/api";
import { toChallengeDto } from "@/lib/social/dto";

export const runtime = "nodejs";

const paramsSchema = z.object({
  challengeId: z.uuid(),
});

function mapChallengeDetailRpcError(message: string) {
  if (message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  if (message === "challenge_not_found") {
    return new ApiRouteError(404, "challenge_not_found", "Challenge was not found.");
  }
  if (message === "cohort_membership_required") {
    return new ApiRouteError(403, "cohort_membership_required", "Cohort membership is required.");
  }
  return new ApiRouteError(500, "social_challenge_unavailable", "Challenge details are unavailable.", {
    cause: message,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ challengeId: string }> | { challengeId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const socialContext = await requireSocialRouteContext(request);

    const { data, error } = await socialContext.supabase.rpc("get_challenge_detail", {
      p_challenge_id: params.challengeId,
    });
    if (error) {
      throw mapChallengeDetailRpcError(error.message);
    }

    const row = data?.[0];
    if (!row) {
      throw new ApiRouteError(404, "challenge_not_found", "Challenge was not found.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: toChallengeDto(row),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "invalid_challenge_id", "Challenge id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Challenge detail request failed unexpectedly.",
    ), correlationId);
  }
}
