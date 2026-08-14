import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  requireAuthenticatedRouteContext,
  withRoute,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});

function disabledError() {
  return new ApiRouteError(
    503,
    "integrations_disabled",
    "Integrations are not enabled."
  );
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRoute(async ({ correlationId }) => {
    if (!isFeatureEnabled("integrationsEnabled")) {
      throw disabledError();
    }

    const url = new URL(request.url);
    const query = querySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!query.success || query.data.from > query.data.to) {
      throw new ApiRouteError(
        400,
        "validation_failed",
        "Provide a valid calendar busy date range."
      );
    }

    const supabase = await createClient();
    const { userId } = await requireAuthenticatedRouteContext({
      supabase,
      unauthorizedMessage: "Sign in to view calendar constraints.",
    });

    const response = await supabase
      .from("integration_calendar_busy_days")
      .select("day,busy_minutes,source_hash,updated_at")
      .eq("user_id", userId)
      .eq("provider", "google_calendar")
      .gte("day", query.data.from)
      .lte("day", query.data.to)
      .order("day", { ascending: true });

    if (response.error) {
      throw new ApiRouteError(
        500,
        "calendar_busy_load_failed",
        "Calendar busy windows could not be loaded."
      );
    }

    return apiSuccessResponse(
      {
        days: (response.data ?? []).map((row) => ({
          day: row.day,
          busyMinutes: row.busy_minutes,
          sourceHash: row.source_hash,
          updatedAt: row.updated_at,
        })),
      },
      correlationId
    );
  });
}
