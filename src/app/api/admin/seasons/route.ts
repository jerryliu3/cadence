import {
  ApiRouteError,
  apiErrorResponse,
  createCorrelationId,
  parseJsonBody,
} from "@/lib/api/route";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/api/admin-context";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const createSchema = z
  .object({
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    title: z.string().trim().min(1).max(140),
    subjectKind: z.enum(["user", "team"]).default("user"),
    metric: z.enum([
      "total_xp",
      "category_xp",
      "completions_count",
      "distinct_active_days",
      "max_streak_days",
    ]),
    metricTrackKey: z.string().trim().min(1).max(64).nullable().optional(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable().optional(),
    status: z.enum(["upcoming", "open", "closed"]).default("upcoming"),
    rollover: z.enum(["none", "weekly", "monthly", "quarterly", "yearly"]).default("none"),
  })
  .superRefine((value, context) => {
    if (value.metric === "category_xp" && !value.metricTrackKey) {
      context.addIssue({
        code: "custom",
        message: "metricTrackKey is required for category_xp seasons.",
        path: ["metricTrackKey"],
      });
    }
  });

export async function GET() {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext("moderator");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("leaderboard_seasons")
      .select("*")
      .order("starts_at", { ascending: false });
    if (error) {
      throw new ApiRouteError(500, "admin_seasons_unavailable", "Seasons are unavailable.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: data ?? [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Admin season list request failed unexpectedly.",
    ), correlationId);
  }
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext("admin");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const body = await parseJsonBody({ request: request, maxBytes: 64 * 1024, schema: createSchema });
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("leaderboard_seasons")
      .insert({
        slug: body.slug,
        title: body.title,
        subject_kind: body.subjectKind,
        metric: body.metric,
        metric_track_key: body.metricTrackKey ?? null,
        starts_at: body.startsAt,
        ends_at: body.endsAt ?? null,
        status: body.status,
        rollover: body.rollover,
        created_by: adminContext.userId,
      })
      .select("*")
      .single();
    if (error) {
      throw new ApiRouteError(500, "admin_season_create_failed", "Could not create season.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: data,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Admin season create request failed unexpectedly.",
    ), correlationId);
  }
}
