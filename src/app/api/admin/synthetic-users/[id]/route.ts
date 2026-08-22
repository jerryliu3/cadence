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
import { SYNTHETIC_PERSONAS, toAdminSyntheticUserDto } from "@/features/admin/synthetic-users";

type DbMutationError = {
  message: string;
  code?: string | null;
};

function mapSyntheticUserMutationError(
  error: DbMutationError,
  fallbackCode: string,
  fallbackMessage: string
) {
  if (error.code === "23505") {
    return new ApiRouteError(409, "synthetic_username_conflict", "Username already exists.");
  }
  if (error.message.includes("admin_synthetic_username_invalid")) {
    return new ApiRouteError(400, "synthetic_username_invalid", "Username format is invalid.");
  }
  if (error.message.includes("admin_synthetic_archetype_invalid")) {
    return new ApiRouteError(400, "synthetic_archetype_invalid", "Archetype is invalid.");
  }
  if (error.message.includes("admin_synthetic_user_id_immutable")) {
    return new ApiRouteError(400, "synthetic_user_id_immutable", "Synthetic user id cannot be changed.");
  }
  if (error.code === "23514") {
    return new ApiRouteError(400, "synthetic_user_invalid", "Synthetic user fields failed validation.");
  }
  return new ApiRouteError(500, fallbackCode, fallbackMessage, {
    cause: error.message,
  });
}

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    persona: z.enum(SYNTHETIC_PERSONAS).optional(),
    dailyBudget: z.number().int().min(1).max(12).optional(),
    archetype: z.string().trim().min(1).max(64).optional(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[a-z0-9_]+$/)
      .optional(),
    displayName: z.string().trim().max(80).nullable().optional(),
    socialActivityVisible: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

type RosterMutationClient = {
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => {
      select: (columns: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string; code?: string | null } | null;
        }>;
      };
    };
  };
  delete: () => {
    eq: (
      column: string,
      value: string
    ) => Promise<{ error: { message: string; code?: string | null } | null }>;
  };
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<{
        data: Record<string, unknown> | null;
        error: { message: string; code?: string | null } | null;
      }>;
    };
  };
};

function rosterTable(admin: ReturnType<typeof createAdminClient>): RosterMutationClient {
  return admin.from("admin_synthetic_users") as unknown as RosterMutationClient;
}

function toViewPatch(body: z.infer<typeof patchSchema>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.persona !== undefined) patch.persona = body.persona;
  if (body.dailyBudget !== undefined) patch.daily_budget = body.dailyBudget;
  if (body.archetype !== undefined) patch.archetype = body.archetype;
  if (body.username !== undefined) patch.username = body.username;
  if (body.displayName !== undefined) patch.display_name = body.displayName;
  if (body.socialActivityVisible !== undefined) {
    patch.social_activity_visible = body.socialActivityVisible;
  }
  return patch;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const adminContext = await requireAdminContext(request, "moderator");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const body = await parseJsonBody({
      request,
      maxBytes: 32 * 1024,
      schema: patchSchema,
    });
    const { data, error } = await rosterTable(createAdminClient())
      .update(toViewPatch(body))
      .eq("user_id", params.id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw mapSyntheticUserMutationError(
        error,
        "admin_synthetic_user_update_failed",
        "Could not update synthetic user."
      );
    }
    if (!data) {
      throw new ApiRouteError(404, "synthetic_user_not_found", "Synthetic user was not found.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: toAdminSyntheticUserDto(data),
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
      new ApiRouteError(500, "internal_error", "Admin synthetic user update failed unexpectedly."),
      correlationId
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const correlationId = createCorrelationId();
  try {
    const params = paramsSchema.parse(await context.params);
    const adminContext = await requireAdminContext(request, "moderator");
    if (!adminContext) {
      throw new ApiRouteError(404, "not_found", "Resource not found.");
    }

    const admin = rosterTable(createAdminClient());
    const { error: deleteError } = await admin.delete().eq("user_id", params.id);
    if (deleteError) {
      throw mapSyntheticUserMutationError(
        deleteError,
        "admin_synthetic_user_disable_failed",
        "Could not disable synthetic user."
      );
    }

    const { data, error } = await admin.select("*").eq("user_id", params.id).maybeSingle();
    if (error) {
      throw new ApiRouteError(
        500,
        "admin_synthetic_user_unavailable",
        "Synthetic user is unavailable.",
        { cause: error.message }
      );
    }
    if (!data) {
      throw new ApiRouteError(404, "synthetic_user_not_found", "Synthetic user was not found.");
    }

    return NextResponse.json(
      {
        schemaVersion: "1",
        correlationId,
        item: toAdminSyntheticUserDto(data),
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
      new ApiRouteError(500, "internal_error", "Admin synthetic user disable failed unexpectedly."),
      correlationId
    );
  }
}
