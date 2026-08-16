import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSocialRouteContext } from "@/lib/social/api";

export const runtime = "nodejs";

const requestSchema = z.object({
  joinCode: z.string().trim().min(1).max(64),
});

function mapJoinGroupError(message: string) {
  if (message === "cohort_join_code_invalid" || message === "group_join_code_invalid") {
    return new ApiRouteError(400, "group_join_code_invalid", "Group join code is invalid.");
  }
  return new ApiRouteError(500, "group_join_failed", "Group join failed.", {
    cause: message,
  });
}

function isMissingJoinGroupFunction(message: string, code?: string): boolean {
  if (code === "42883") {
    return true;
  }
  return message.includes("join_group_with_code_service") && message.includes("does not exist");
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const body = await parseJsonBody({
      request,
      schema: requestSchema,
      maxBytes: 8 * 1024,
    });
    const socialContext = await requireSocialRouteContext(request);

    const rpcArgs = { p_join_code: body.joinCode };
    const primary = await socialContext.supabase.rpc("join_group_with_code_service", rpcArgs);

    let data = primary.data;
    let error = primary.error;
    if (error && isMissingJoinGroupFunction(error.message, (error as { code?: string }).code)) {
      const legacy = await socialContext.supabase.rpc("join_cohort_with_code_service", rpcArgs);
      data = legacy.data;
      error = legacy.error;
    }
    if (error) {
      throw mapJoinGroupError(error.message);
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        groupId: data,
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
      new ApiRouteError(500, "internal_error", "Group join request failed unexpectedly."),
      correlationId
    );
  }
}
