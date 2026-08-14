import { NextResponse } from "next/server";
import { ApiRouteError, apiErrorResponse, createCorrelationId } from "@/lib/api/route";
import { requireAdminContext } from "@/lib/api/admin-context";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const adminContext = await requireAdminContext(request, "moderator");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const admin = createAdminClient();
    const [{ data: categoryRows, error: categoryError }, { data: cohortRows, error: cohortError }] =
      await Promise.all([
        admin.from("goal_categories").select("key,label").order("sort_order", { ascending: true }),
        admin.from("cohorts").select("id,slug,title,is_active").order("title", { ascending: true }),
      ]);

    if (categoryError) {
      throw new ApiRouteError(500, "admin_metadata_unavailable", "Goal category metadata is unavailable.", {
        cause: categoryError.message,
      });
    }
    if (cohortError) {
      throw new ApiRouteError(500, "admin_metadata_unavailable", "Cohort metadata is unavailable.", {
        cause: cohortError.message,
      });
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        goalCategories: (categoryRows ?? []).map((row) => ({
          key: row.key,
          label: row.label,
        })),
        cohorts: (cohortRows ?? []).map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          isActive: row.is_active,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiErrorResponse(error, correlationId);
    }
    return apiErrorResponse(
      new ApiRouteError(500, "internal_error", "Admin metadata request failed unexpectedly."),
      correlationId
    );
  }
}
