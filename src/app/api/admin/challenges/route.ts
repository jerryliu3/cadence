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
    slug: z.string().trim().min(2).max(63).regex(/^[a-z0-9][a-z0-9_-]{1,62}$/),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(["draft", "scheduled", "active", "closed", "archived"]).default("draft"),
    subjectKind: z.enum(["user", "team"]).default("user"),
    metric: z.enum([
      "total_xp",
      "category_xp",
      "completions_count",
      "distinct_active_days",
      "max_streak_days",
    ]),
    metricTrackKey: z.string().trim().min(1).max(64).nullable().optional(),
    targetValue: z.number().positive(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    rewardXp: z.number().int().nonnegative().default(0),
    maxParticipants: z.number().int().positive().nullable().optional(),
    audienceKind: z.enum(["global", "cohort"]).default("global"),
    cohortId: z.uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.metric === "category_xp" && !value.metricTrackKey) {
      context.addIssue({
        code: "custom",
        message: "metricTrackKey is required for category_xp challenges.",
        path: ["metricTrackKey"],
      });
    }
    if (value.audienceKind === "cohort" && !value.cohortId) {
      context.addIssue({
        code: "custom",
        message: "cohortId is required for group-scoped challenges.",
        path: ["cohortId"],
      });
    }
    if (value.audienceKind === "global" && value.cohortId) {
      context.addIssue({
        code: "custom",
        message: "cohortId must be null for global challenges.",
        path: ["cohortId"],
      });
    }
  });

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
  if (error.code === "23514" && error.message.includes("challenges_slug_format")) {
    return new ApiRouteError(400, "challenge_slug_invalid", "Challenge slug format is invalid.");
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
      .from("challenges")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      throw new ApiRouteError(500, "admin_challenges_unavailable", "Challenges are unavailable.", {
        cause: error.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (data ?? []).map((row) => toChallengeDto(row as Record<string, unknown>)),
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
      new ApiRouteError(500, "internal_error", "Admin challenge list request failed unexpectedly."),
      correlationId
    );
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
      .from("challenges")
      .insert({
        slug: body.slug,
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        subject_kind: body.subjectKind,
        metric: body.metric,
        metric_track_key: body.metricTrackKey ?? null,
        target_value: body.targetValue,
        starts_at: body.startsAt,
        ends_at: body.endsAt,
        reward_xp: body.rewardXp,
        max_participants: body.maxParticipants ?? null,
        audience_kind: body.audienceKind,
        cohort_id: body.cohortId ?? null,
        created_by: adminContext.userId,
      })
      .select("*")
      .single();
    if (error) {
      throw mapChallengeMutationError(
        error,
        "admin_challenge_create_failed",
        "Could not create challenge."
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: toChallengeDto(data as Record<string, unknown>),
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
    return apiErrorResponse(
      new ApiRouteError(500, "internal_error", "Admin challenge create request failed unexpectedly."),
      correlationId
    );
  }
}
