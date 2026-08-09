import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBoundedJsonBody } from "@/lib/api/body";
import { requireAdminContext } from "@/lib/api/admin-context";
import { createCorrelationId } from "@/lib/api/context";
import { RouteError, routeErrorResponse, unknownRouteErrorResponse } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(["draft", "scheduled", "active", "closed", "archived"]).optional(),
    enrollment: z.enum(["auto", "opt_in"]).optional(),
    subjectKind: z.enum(["user", "duo"]).optional(),
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
    targetValue: z.number().positive().optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
    rewardXp: z.number().int().nonnegative().optional(),
    maxParticipants: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

const immutableWhenActive = new Set([
  "enrollment",
  "subjectKind",
  "metric",
  "metricTrackKey",
  "targetValue",
  "startsAt",
  "endsAt",
  "maxParticipants",
]);

function toChallengeDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    enrollment: row.enrollment,
    subjectKind: row.subject_kind,
    metric: row.metric,
    metricTrackKey: row.metric_track_key,
    targetValue: Number(row.target_value),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rewardXp: row.reward_xp,
    maxParticipants: row.max_participants,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
      throw new RouteError(404, "not_found", "Resource not found.");
    }

    const body = await parseBoundedJsonBody(request, 64 * 1024, patchSchema);
    const admin = createAdminClient();

    const { data: existing, error: existingError } = await admin
      .from("challenges")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (existingError) {
      throw new RouteError(500, "admin_challenge_lookup_failed", "Could not read challenge.", {
        cause: existingError.message,
      });
    }
    if (!existing) {
      throw new RouteError(404, "challenge_not_found", "Challenge was not found.");
    }

    if (
      existing.status === "active" &&
      Object.keys(body).some((key) => immutableWhenActive.has(key))
    ) {
      throw new RouteError(
        409,
        "challenge_active_field_locked",
        "Cannot update immutable fields on an active challenge."
      );
    }

    const updates: Database["public"]["Tables"]["challenges"]["Update"] = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.enrollment !== undefined) updates.enrollment = body.enrollment;
    if (body.subjectKind !== undefined) updates.subject_kind = body.subjectKind;
    if (body.metric !== undefined) updates.metric = body.metric;
    if (body.metricTrackKey !== undefined) updates.metric_track_key = body.metricTrackKey;
    if (body.targetValue !== undefined) updates.target_value = body.targetValue;
    if (body.startsAt !== undefined) updates.starts_at = body.startsAt;
    if (body.endsAt !== undefined) updates.ends_at = body.endsAt;
    if (body.rewardXp !== undefined) updates.reward_xp = body.rewardXp;
    if (body.maxParticipants !== undefined) updates.max_participants = body.maxParticipants;

    const { data, error } = await admin
      .from("challenges")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) {
      throw new RouteError(500, "admin_challenge_update_failed", "Could not update challenge.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: toChallengeDto(data as Record<string, unknown>),
      },
      { headers: { "Cache-Control": "no-store" } }
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
      message: "Admin challenge update request failed unexpectedly.",
    });
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
      throw new RouteError(404, "not_found", "Resource not found.");
    }

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("challenges")
      .select("id,status")
      .eq("id", params.id)
      .maybeSingle();
    if (existingError) {
      throw new RouteError(500, "admin_challenge_lookup_failed", "Could not read challenge.", {
        cause: existingError.message,
      });
    }
    if (!existing) {
      throw new RouteError(404, "challenge_not_found", "Challenge was not found.");
    }
    if (existing.status === "active") {
      throw new RouteError(
        409,
        "challenge_active_delete_blocked",
        "Active challenges must be closed before deletion."
      );
    }

    const { error } = await admin.from("challenges").delete().eq("id", params.id);
    if (error) {
      throw new RouteError(500, "admin_challenge_delete_failed", "Could not delete challenge.", {
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
      message: "Admin challenge delete request failed unexpectedly.",
    });
  }
}
