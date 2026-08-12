import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSocialRouteContext } from "@/lib/social/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  joinCode: z.string().trim().min(1).max(64),
});

function mapJoinCohortError(message: string) {
  if (message === "cohort_join_code_invalid") {
    return new ApiRouteError(400, "cohort_join_code_invalid", "Cohort join code is invalid.");
  }
  return new ApiRouteError(500, "cohort_join_failed", "Cohort join failed.", {
    cause: message,
  });
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const body = await parseJsonBody({
      request,
      schema: requestSchema,
      maxBytes: 8 * 1024,
    });
    const supabase = await createClient();
    const socialContext = await requireSocialRouteContext({ supabase });

    const { data, error } = await socialContext.supabase.rpc(
      "join_cohort_with_code_service",
      {
        p_join_code: body.joinCode,
      }
    );
    if (error) {
      throw mapJoinCohortError(error.message);
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        cohortId: data,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "validation_failed", "Request payload failed validation.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(
      new ApiRouteError(500, "internal_error", "Cohort join request failed unexpectedly."),
      correlationId
    );
  }
}
