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
    slug: z.string().trim().min(2).max(63).regex(/^[a-z0-9][a-z0-9_-]{1,62}$/),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(["draft", "scheduled", "active", "closed", "archived"]).default("draft"),
    enrollment: z.enum(["auto", "opt_in"]).default("opt_in"),
    subjectKind: z.enum(["user", "duo"]).default("user"),
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
        message: "cohortId is required for cohort-scoped challenges.",
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
    enrollment: row.enrollment,
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

export async function GET() {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext("moderator");
    if (!adminContext) {
      throw new RouteError(404, "not_found", "Resource not found.");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("challenges")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      throw new RouteError(500, "admin_challenges_unavailable", "Challenges are unavailable.", {
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
      message: "Admin challenge list request failed unexpectedly.",
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
      .from("challenges")
      .insert({
        slug: body.slug,
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        enrollment: body.enrollment,
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
      throw new RouteError(500, "admin_challenge_create_failed", "Could not create challenge.", {
        cause: error.message,
      });
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
      message: "Admin challenge create request failed unexpectedly.",
    });
  }
}
