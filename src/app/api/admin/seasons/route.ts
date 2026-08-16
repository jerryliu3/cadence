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

type DbMutationError = {
  message: string;
  code?: string | null;
};

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
    scope: z.enum(["global", "group"]).default("global"),
    groupId: z.uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.metric === "category_xp" && !value.metricTrackKey) {
      context.addIssue({
        code: "custom",
        message: "metricTrackKey is required for category_xp seasons.",
        path: ["metricTrackKey"],
      });
    }
    if (value.scope === "group" && !value.groupId) {
      context.addIssue({
        code: "custom",
        message: "groupId is required for group-scoped seasons.",
        path: ["groupId"],
      });
    }
    if (value.scope === "global" && value.groupId) {
      context.addIssue({
        code: "custom",
        message: "groupId must be null for global seasons.",
        path: ["groupId"],
      });
    }
  });

function toSeasonDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subject_kind: row.subject_kind,
    metric: row.metric,
    metric_track_key: row.metric_track_key,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    rollover: row.rollover,
    scope: row.scope === "cohort" ? "group" : "global",
    groupId: row.cohort_id,
  };
}

function mapSeasonMutationError(error: DbMutationError, fallbackCode: string, fallbackMessage: string) {
  if (error.code === "23505" && error.message.includes("leaderboard_seasons_slug_key")) {
    return new ApiRouteError(409, "season_slug_conflict", "Season slug already exists.");
  }
  if (error.code === "23505" && error.message.includes("leaderboard_seasons_one_open")) {
    return new ApiRouteError(
      409,
      "season_open_conflict",
      "An open season already exists for this subject/metric/scope."
    );
  }
  if (error.code === "23514" && error.message.includes("leaderboard_seasons_window")) {
    return new ApiRouteError(400, "season_window_invalid", "Season end time must be after start time.");
  }
  if (error.code === "23514" && error.message.includes("leaderboard_seasons_track_required")) {
    return new ApiRouteError(
      400,
      "season_metric_track_required",
      "metricTrackKey is required for category_xp seasons."
    );
  }
  if (error.code === "23514" && error.message.includes("leaderboard_seasons_rollover_needs_end")) {
    return new ApiRouteError(
      400,
      "season_rollover_requires_end",
      "Season rollover requires an explicit season end time."
    );
  }
  if (error.code === "23503" && error.message.includes("leaderboard_seasons_metric_track_key_fkey")) {
    return new ApiRouteError(400, "metric_track_key_unknown", "metricTrackKey does not match a known track.");
  }
  if (error.code === "23503" && error.message.includes("leaderboard_seasons_cohort_id_fkey")) {
    return new ApiRouteError(400, "cohort_not_found", "Group id is invalid.");
  }
  return new ApiRouteError(500, fallbackCode, fallbackMessage, {
    cause: error.message,
  });
}

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext(request, "moderator");
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
        items: (data ?? []).map((row) => toSeasonDto(row as Record<string, unknown>)),
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
    const adminContext = await requireAdminContext(request, "admin");
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
        scope: body.scope === "group" ? "cohort" : "global",
        cohort_id: body.groupId ?? null,
        created_by: adminContext.userId,
      })
      .select("*")
      .single();
    if (error) {
      throw mapSeasonMutationError(error, "admin_season_create_failed", "Could not create season.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: toSeasonDto(data as Record<string, unknown>),
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
