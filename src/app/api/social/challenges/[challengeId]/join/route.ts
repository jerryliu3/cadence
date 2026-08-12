import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  challengeId: z.uuid(),
});

function mapJoinRpcError(message: string) {
  if (message === "challenge_full") {
    return new ApiRouteError(409, "challenge_full", "Challenge has reached participant capacity.");
  }
  if (message === "challenge_not_eligible") {
    return new ApiRouteError(403, "challenge_not_eligible", "You are not eligible for challenges.");
  }
  if (message === "challenge_not_joinable") {
    return new ApiRouteError(409, "challenge_not_joinable", "Challenge is not open for joining.");
  }
  if (message === "team_required") {
    return new ApiRouteError(409, "team_required", "An active team is required for this challenge.");
  }
  if (message === "challenge_subject_not_supported") {
    return new ApiRouteError(409, "challenge_subject_not_supported", "Challenge subject is unsupported.");
  }
  return new ApiRouteError(500, "challenge_join_failed", "Challenge join failed.", {
    cause: message,
  });
}

function mapLeaveRpcError(message: string) {
  if (message === "challenge_not_leaveable") {
    return new ApiRouteError(409, "challenge_not_leaveable", "Challenge is not open for leaving.");
  }
  if (message === "team_required") {
    return new ApiRouteError(409, "team_required", "An active team is required for this challenge.");
  }
  return new ApiRouteError(500, "challenge_leave_failed", "Challenge leave failed.", {
    cause: message,
  });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ challengeId: string }> | { challengeId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { data, error } = await socialContext.supabase.rpc("join_challenge_service", {
      p_challenge_id: params.challengeId,
    });
    if (error) {
      throw mapJoinRpcError(error.message);
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        challengeId: params.challengeId,
        joined: Boolean(data),
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Challenge join request failed unexpectedly.",
    ), correlationId);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ challengeId: string }> | { challengeId: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { data, error } = await socialContext.supabase.rpc("leave_challenge_service", {
      p_challenge_id: params.challengeId,
    });
    if (error) {
      throw mapLeaveRpcError(error.message);
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        challengeId: params.challengeId,
        joined: !data,
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Challenge leave request failed unexpectedly.",
    ), correlationId);
  }
}
