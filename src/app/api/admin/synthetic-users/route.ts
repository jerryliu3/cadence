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
import {
  toAdminSyntheticConfigDto,
  toAdminSyntheticUserDto,
} from "@/features/admin/synthetic-users";

export const runtime = "nodejs";

const provisionSchema = z.object({
  targetCount: z.number().int().min(1).max(500),
  goalsPerUser: z.number().int().min(1).max(12).optional(),
});

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext(request, "moderator");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const admin = createAdminClient();
    const [{ data: userRows, error: userError }, { data: configRow, error: configError }] =
      await Promise.all([
        admin.from("admin_synthetic_users").select("*").order("username", { ascending: true }),
        admin.from("synthetic_config").select("*").eq("id", 1).maybeSingle(),
      ]);

    if (userError) {
      throw new ApiRouteError(
        500,
        "admin_synthetic_users_unavailable",
        "Synthetic users are unavailable.",
        { cause: userError.message }
      );
    }
    if (configError || !configRow) {
      throw new ApiRouteError(
        500,
        "admin_synthetic_config_unavailable",
        "Synthetic config is unavailable.",
        { cause: configError?.message }
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        items: (userRows ?? []).map((row) => toAdminSyntheticUserDto(row as Record<string, unknown>)),
        config: toAdminSyntheticConfigDto(configRow as Record<string, unknown>),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(
      new ApiRouteError(500, "internal_error", "Admin synthetic user list request failed unexpectedly."),
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

    const body = await parseJsonBody({
      request,
      maxBytes: 32 * 1024,
      schema: provisionSchema,
    });
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("provision_synthetic_users_service", {
      p_target_count: body.targetCount,
      p_goals_per_user: body.goalsPerUser ?? 6,
    });

    if (error) {
      throw new ApiRouteError(
        500,
        "admin_synthetic_provision_failed",
        "Could not provision synthetic users.",
        { cause: error.message }
      );
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        provisionedCount: Number(data ?? 0),
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
      new ApiRouteError(500, "internal_error", "Admin synthetic provision request failed unexpectedly."),
      correlationId
    );
  }
}
