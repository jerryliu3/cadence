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

const paramsSchema = z.object({ id: z.uuid() });
const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    status: z.enum(["upcoming", "open", "closed"]).optional(),
    rollover: z.enum(["none", "weekly", "monthly", "quarterly", "yearly"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

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
    if (body.title !== undefined) updates.title = body.title;
    if (body.startsAt !== undefined) updates.starts_at = body.startsAt;
    if (body.endsAt !== undefined) updates.ends_at = body.endsAt;
    if (body.status !== undefined) updates.status = body.status;
    if (body.rollover !== undefined) updates.rollover = body.rollover;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("leaderboard_seasons")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) {
      throw new ApiRouteError(500, "admin_season_update_failed", "Could not update season.", {
        cause: error.message,
      });
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
