import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiRouteError,
  createCorrelationId,
  handleApiRouteError,
  parseJsonBody,
  requireAuthenticatedRouteContext,
} from "@/lib/api/route-helpers";
import type { Database } from "@/lib/supabase/database.types";

const updateProfileRequestSchema = z.object({
  username: z.string().trim().min(1).max(64),
  displayName: z.string().max(120).nullable(),
  avatarUrl: z.string().max(2048).nullable(),
});

export async function PUT(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const payload = await parseJsonBody({
      request,
      schema: updateProfileRequestSchema,
    });

    const upsertPayload: Database["public"]["Tables"]["profiles"]["Insert"] = {
      id: userId,
      username: payload.username,
      display_name: payload.displayName,
      avatar_url: payload.avatarUrl,
    };

    const { error } = await supabase
      .from("profiles")
      .upsert(upsertPayload, { onConflict: "id" });

    if (error) {
      throw new ApiRouteError(
        500,
        "profile_update_failed",
        error.message ?? "Profile could not be saved."
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
