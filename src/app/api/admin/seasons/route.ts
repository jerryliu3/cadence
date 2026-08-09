import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBoundedJsonBody } from "@/lib/api/body";
import { requireAdminContext } from "@/lib/api/admin-context";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const createSchema = z
  .object({
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    title: z.string().trim().min(1).max(140),
    subjectKind: z.enum(["user", "duo"]).default("user"),
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
    rollover: z.enum(["none", "weekly", "monthly", "quarterly"]).default("none"),
    scope: z.enum(["global", "cohort"]).default("global"),
    cohortId: z.uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.metric === "category_xp" && !value.metricTrackKey) {
      context.addIssue({
        code: "custom",
        message: "metricTrackKey is required for category_xp seasons.",
        path: ["metricTrackKey"],
      });
    }
    if (value.scope === "cohort" && !value.cohortId) {
      context.addIssue({
        code: "custom",
        message: "cohortId is required for cohort-scoped seasons.",
        path: ["cohortId"],
      });
    }
    if (value.scope === "global" && value.cohortId) {
      context.addIssue({
        code: "custom",
        message: "cohortId must be null for global seasons.",
        path: ["cohortId"],
      });
    }
  });

export async function GET() {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext("moderator");
    if (!adminContext) {
      throw new RouteError(404, "not_found", "Resource not found.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("leaderboard_seasons")
      .select("*")
      .order("starts_at", { ascending: false });
    if (error) {
      throw new RouteError(500, "admin_seasons_unavailable", "Seasons are unavailable.", {
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
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Admin season list request failed unexpectedly.",
    });
  }
}

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext("admin");
    if (!adminContext) {
      throw new RouteError(404, "not_found", "Resource not found.");
    }

    const body = await parseBoundedJsonBody(request, 64 * 1024, createSchema);
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
        scope: body.scope,
        cohort_id: body.cohortId ?? null,
        created_by: adminContext.userId,
      })
      .select("*")
      .single();
    if (error) {
      throw new RouteError(500, "admin_season_create_failed", "Could not create season.", {
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
    if (error instanceof RouteError) {
      return routeErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return routeErrorResponse(
        new RouteError(400, "validation_failed", "Request payload failed validation.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return unknownRouteErrorResponse({
      correlationId,
      message: "Admin season create request failed unexpectedly.",
    });
  }
}
