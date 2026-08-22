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
import { toAdminSyntheticConfigDto } from "@/features/admin/synthetic-users";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxCompletionsPerTick: z.number().int().min(0).max(50).optional(),
    maxReactionsPerTick: z.number().int().min(0).max(100).optional(),
    throttleAboveRealDau: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

function toConfigPatch(body: z.infer<typeof patchSchema>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.maxCompletionsPerTick !== undefined) {
    patch.max_completions_per_tick = body.maxCompletionsPerTick;
  }
  if (body.maxReactionsPerTick !== undefined) {
    patch.max_reactions_per_tick = body.maxReactionsPerTick;
  }
  if (body.throttleAboveRealDau !== undefined) {
    patch.throttle_above_real_dau = body.throttleAboveRealDau;
  }
  return patch;
}

export async function PATCH(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext(request, "moderator");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const body = await parseJsonBody({
      request,
      maxBytes: 32 * 1024,
      schema: patchSchema,
    });
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("synthetic_config")
      .update(toConfigPatch(body))
      .eq("id", 1)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new ApiRouteError(
        500,
        "admin_synthetic_config_update_failed",
        "Could not update synthetic config.",
        { cause: error.message }
      );
    }
    if (!data) {
      throw new ApiRouteError(404, "synthetic_config_not_found", "Synthetic config was not found.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        config: toAdminSyntheticConfigDto(data as Record<string, unknown>),
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
      new ApiRouteError(500, "internal_error", "Admin synthetic config update failed unexpectedly."),
      correlationId
    );
  }
}
