import { z } from "zod";
import {
  ApiRouteError,
  apiErrorResponse,
  requireAuthenticatedRequestContext,
  createCorrelationId,
} from "@/lib/api/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublicProfileBundle } from "@/lib/social/public-profile";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  subjectUserId: z.uuid(),
});

const querySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).optional(),
});

export async function GET(
  request: Request,
  context: {
    params: Promise<{ subjectUserId: string }> | { subjectUserId: string };
  }
) {
  const correlationId = createCorrelationId();
  try {
    const { userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to view public profiles.",
    });
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      throw new ApiRouteError(400, "validation_failed", "Provide a valid profile id.");
    }
    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      year: url.searchParams.get("year") ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new ApiRouteError(400, "validation_failed", "Provide a valid year.");
    }
    const selectedYear = parsedQuery.data.year ?? new Date().getUTCFullYear();
    const admin = createAdminClient();
    const item = await loadPublicProfileBundle({
      admin,
      viewerUserId: userId,
      subjectUserId: parsedParams.data.subjectUserId,
      selectedYear,
    });

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(
      new ApiRouteError(
        500,
        "public_profile_load_failed",
        "Public profile data could not be loaded."
      ),
      correlationId
    );
  }
}
