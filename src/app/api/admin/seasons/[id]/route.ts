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
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type DbMutationError = {
  message: string;
  code?: string | null;
};

const paramsSchema = z.object({ id: z.uuid() });
const patchSchema = z
  .object({
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9_-]{1,79}$/).optional(),
    title: z.string().trim().min(1).max(140).optional(),
    subjectKind: z.enum(["user", "team"]).optional(),
    metric: z
      .enum([
        "total_xp",
        "category_xp",
        "completions_count",
        "distinct_active_days",
        "max_streak_days",
      ])
      .optional(),
    metricTrackKey: z.string().trim().min(1).max(64).nullable().optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    status: z.enum(["upcoming", "open", "closed"]).optional(),
    rollover: z.enum(["none", "weekly", "monthly", "quarterly", "yearly"]).optional(),
    scope: z.enum(["global", "cohort"]).optional(),
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
    if (value.scope === "cohort" && value.cohortId === undefined) {
      context.addIssue({
        code: "custom",
        message: "cohortId is required for cohort-scoped seasons.",
        path: ["cohortId"],
      });
    }
    if (value.scope === "global" && value.cohortId !== undefined && value.cohortId !== null) {
      context.addIssue({
        code: "custom",
        message: "cohortId must be null for global seasons.",
        path: ["cohortId"],
      });
    }
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

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
    return new ApiRouteError(400, "cohort_not_found", "Cohort id is invalid.");
  }
  return new ApiRouteError(500, fallbackCode, fallbackMessage, {
    cause: error.message,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const adminContext = await requireAdminContext("admin");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const body = await parseJsonBody({ request: request, maxBytes: 64 * 1024, schema: patchSchema });
    const updates: Database["public"]["Tables"]["leaderboard_seasons"]["Update"] = {};
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.title !== undefined) updates.title = body.title;
    if (body.subjectKind !== undefined) updates.subject_kind = body.subjectKind;
    if (body.metric !== undefined) updates.metric = body.metric;
    if (body.metricTrackKey !== undefined) updates.metric_track_key = body.metricTrackKey;
    if (body.startsAt !== undefined) updates.starts_at = body.startsAt;
    if (body.endsAt !== undefined) updates.ends_at = body.endsAt;
    if (body.status !== undefined) updates.status = body.status;
    if (body.rollover !== undefined) updates.rollover = body.rollover;
    if (body.scope !== undefined) updates.scope = body.scope;
    if (body.scope === "global" && body.cohortId === undefined) {
      updates.cohort_id = null;
    }
    if (body.cohortId !== undefined) updates.cohort_id = body.cohortId;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("leaderboard_seasons")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) {
      throw mapSeasonMutationError(error, "admin_season_update_failed", "Could not update season.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: data,
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
    return apiErrorResponse(new ApiRouteError(500, "internal_error", "Admin season update request failed unexpectedly.",
    ), correlationId);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const adminContext = await requireAdminContext("admin");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("leaderboard_seasons")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();
    if (existingError) {
      throw new ApiRouteError(500, "admin_season_lookup_failed", "Could not read season.", {
        cause: existingError.message,
      });
    }
    if (!existing) {
      throw new ApiRouteError(404, "season_not_found", "Leaderboard season was not found.");
    }

    const { error } = await admin.from("leaderboard_seasons").delete().eq("id", params.id);
    if (error) {
      if (error.code === "23503") {
        throw new ApiRouteError(
          409,
          "season_delete_blocked",
          "Season cannot be deleted because dependent records still exist."
        );
      }
      throw new ApiRouteError(500, "admin_season_delete_failed", "Could not delete season.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        deleted: true,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    if (error instanceof z.ZodError) {
      return apiErrorResponse(
        new ApiRouteError(400, "invalid_season_id", "Season id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(
      new ApiRouteError(500, "internal_error", "Admin season delete request failed unexpectedly."),
      correlationId
    );
  }
}
