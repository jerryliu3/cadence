import { NextResponse } from "next/server";
import { z } from "zod";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  challengeId: z.uuid(),
});

function mapJoinRpcError(message: string) {
  if (message === "challenge_full") {
    return new RouteError(409, "challenge_full", "Challenge has reached participant capacity.");
  }
  if (message === "challenge_not_eligible") {
    return new RouteError(403, "challenge_not_eligible", "You are not eligible for challenges.");
  }
  if (message === "challenge_not_joinable") {
    return new RouteError(409, "challenge_not_joinable", "Challenge is not open for joining.");
  }
  return new RouteError(500, "challenge_join_failed", "Challenge join failed.", {
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
    const socialContext = await requireSocialRouteContext({
      supabase,
      requireChallenges: true,
    });

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
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "invalid_challenge_id", "Challenge id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Challenge join request failed unexpectedly.",
    });
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
    const socialContext = await requireSocialRouteContext({
      supabase,
      requireChallenges: true,
    });

    const { data, error } = await socialContext.supabase.rpc("leave_challenge_service", {
      p_challenge_id: params.challengeId,
    });
    if (error) {
      throw new RouteError(500, "challenge_leave_failed", "Challenge leave failed.", {
        cause: error.message,
      });
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
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "invalid_challenge_id", "Challenge id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Challenge leave request failed unexpectedly.",
    });
  }
}
