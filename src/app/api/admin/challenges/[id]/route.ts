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
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(["draft", "scheduled", "active", "closed", "archived"]).optional(),
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
    targetValue: z.number().positive().optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
    rewardXp: z.number().int().nonnegative().optional(),
    maxParticipants: z.number().int().positive().nullable().optional(),
    audienceKind: z.enum(["global", "cohort"]).optional(),
    cohortId: z.uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.audienceKind === "cohort" && value.cohortId === undefined) {
      context.addIssue({
        code: "custom",
        message: "cohortId is required when audienceKind is cohort.",
        path: ["cohortId"],
      });
    }
    if (value.audienceKind === "global" && value.cohortId !== undefined && value.cohortId !== null) {
      context.addIssue({
        code: "custom",
        message: "cohortId must be null when audienceKind is global.",
        path: ["cohortId"],
      });
    }
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

const immutableWhenActive = new Set([
  "subjectKind",
  "metric",
  "metricTrackKey",
  "targetValue",
  "startsAt",
  "endsAt",
  "maxParticipants",
  "audienceKind",
  "cohortId",
]);

function toChallengeDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    subjectKind: row.subject_kind,
    metric: row.metric,
    metricTrackKey: row.metric_track_key,
    targetValue: Number(row.target_value),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    rewardXp: row.reward_xp,
    maxParticipants: row.max_participants,
    audienceKind: row.audience_kind,
    cohortId: row.cohort_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChallengeMutationError(error: DbMutationError, fallbackCode: string, fallbackMessage: string) {
  if (error.code === "23505" && error.message.includes("challenges_slug_key")) {
    return new ApiRouteError(409, "challenge_slug_conflict", "Challenge slug already exists.");
  }
  if (error.code === "23514" && error.message.includes("challenges_window")) {
    return new ApiRouteError(400, "challenge_window_invalid", "Challenge end time must be after start time.");
  }
  if (error.code === "23514" && error.message.includes("challenges_track_required")) {
    return new ApiRouteError(
      400,
      "challenge_metric_track_required",
      "metricTrackKey is required for category_xp challenges."
    );
  }
  if (error.code === "23514" && error.message.includes("challenges_target_positive")) {
    return new ApiRouteError(400, "challenge_target_invalid", "Challenge target value must be greater than zero.");
  }
  if (error.code === "23514" && error.message.includes("challenges_reward_nonneg")) {
    return new ApiRouteError(400, "challenge_reward_invalid", "Challenge reward XP must be non-negative.");
  }
  if (error.code === "23503" && error.message.includes("challenges_metric_track_key_fkey")) {
    return new ApiRouteError(400, "metric_track_key_unknown", "metricTrackKey does not match a known track.");
  }
  if (error.code === "23503" && error.message.includes("challenges_cohort_id_fkey")) {
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
    const admin = createAdminClient();

    const { data: existing, error: existingError } = await admin
      .from("challenges")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (existingError) {
      throw new ApiRouteError(500, "admin_challenge_lookup_failed", "Could not read challenge.", {
        cause: existingError.message,
      });
    }
    if (!existing) {
      throw new ApiRouteError(404, "challenge_not_found", "Challenge was not found.");
    }

    if (
      existing.status === "active" &&
      Object.keys(body).some((key) => immutableWhenActive.has(key))
    ) {
      throw new ApiRouteError(
        409,
        "challenge_active_field_locked",
        "Cannot update immutable fields on an active challenge."
      );
    }

    const updates: Database["public"]["Tables"]["challenges"]["Update"] = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.subjectKind !== undefined) updates.subject_kind = body.subjectKind;
    if (body.metric !== undefined) updates.metric = body.metric;
    if (body.metricTrackKey !== undefined) updates.metric_track_key = body.metricTrackKey;
    if (body.targetValue !== undefined) updates.target_value = body.targetValue;
    if (body.startsAt !== undefined) updates.starts_at = body.startsAt;
    if (body.endsAt !== undefined) updates.ends_at = body.endsAt;
    if (body.rewardXp !== undefined) updates.reward_xp = body.rewardXp;
    if (body.maxParticipants !== undefined) updates.max_participants = body.maxParticipants;
    if (body.audienceKind !== undefined) updates.audience_kind = body.audienceKind;
    if (body.cohortId !== undefined) updates.cohort_id = body.cohortId;

    const { data, error } = await admin
      .from("challenges")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) {
      throw mapChallengeMutationError(
        error,
        "admin_challenge_update_failed",
        "Could not update challenge."
      );
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
      new ApiRouteError(500, "internal_error", "Admin challenge update request failed unexpectedly."),
      correlationId
    );
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
      .from("challenges")
      .select("id,status")
      .eq("id", params.id)
      .maybeSingle();
    if (existingError) {
      throw new ApiRouteError(500, "admin_challenge_lookup_failed", "Could not read challenge.", {
        cause: existingError.message,
      });
    }
    if (!existing) {
      throw new ApiRouteError(404, "challenge_not_found", "Challenge was not found.");
    }
    if (existing.status === "active") {
      throw new ApiRouteError(
        409,
        "challenge_active_delete_blocked",
        "Active challenges must be closed before deletion."
      );
    }

    const { error } = await admin.from("challenges").delete().eq("id", params.id);
    if (error) {
      if (error.code === "23503") {
        throw new ApiRouteError(
          409,
          "challenge_delete_blocked",
          "Challenge cannot be deleted because dependent records still exist."
        );
      }
      throw new ApiRouteError(500, "admin_challenge_delete_failed", "Could not delete challenge.", {
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
        new ApiRouteError(400, "invalid_challenge_id", "Challenge id is invalid.", {
          issues: error.issues,
        }),
        correlationId
      );
    }
    return apiErrorResponse(
      new ApiRouteError(500, "internal_error", "Admin challenge delete request failed unexpectedly."),
      correlationId
    );
  }
}
