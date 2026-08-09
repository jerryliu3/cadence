import { z } from "zod";
import {
  apiSuccessResponse,
  createCorrelationId,
  handleApiRouteError,
  mapPostgrestWriteError,
  parseJsonBody,
  requireAuthenticatedRouteContext,
} from "@/lib/api/route-helpers";
import type { UpdateProfileRequestBody } from "@/lib/api/goals-social-contract";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const updateProfileRequestSchema: z.ZodType<UpdateProfileRequestBody> = z.object({
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
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "profile_update_failed",
        fallbackMessage: "Profile could not be saved.",
      });
    }

    return apiSuccessResponse({ success: true }, correlationId);
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
