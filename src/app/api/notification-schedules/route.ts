import { z } from "zod";
import {
  ApiRouteError,
  apiSuccessResponse,
  createCorrelationId,
  handleApiRouteError,
  mapPostgrestWriteError,
  parseJsonBody,
  requireAuthenticatedRouteContext,
} from "@/lib/api/route-helpers";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const createScheduleSchema = z.object({
  hour: z.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(500),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const updateScheduleSchema = z
  .object({
    id: z.string().uuid(),
    hour: z.number().int().min(0).max(23).optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    message: z.string().trim().min(1).max(500).optional(),
    enabled: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.hour !== undefined ||
      value.timezone !== undefined ||
      value.message !== undefined ||
      value.enabled !== undefined ||
      value.isDefault !== undefined,
    {
      message: "At least one schedule update field is required.",
    }
  );

const deleteScheduleSchema = z.object({
  id: z.string().uuid(),
});

type NotificationScheduleRow =
  Database["public"]["Tables"]["notification_schedules"]["Row"];

export async function POST(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const payload = await parseJsonBody({
      request,
      schema: createScheduleSchema,
    });

    const insertPayload: Database["public"]["Tables"]["notification_schedules"]["Insert"] =
      {
        user_id: userId,
        hour: payload.hour,
        timezone: payload.timezone,
        message: payload.message,
        enabled: payload.enabled ?? true,
        is_default: payload.isDefault ?? false,
      };

    const { data, error } = await supabase
      .from("notification_schedules")
      .insert(insertPayload)
      .select("*")
      .single();
    if (error) {
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "notification_schedule_create_failed",
        fallbackMessage: "Notification schedule could not be created.",
      });
    }

    return apiSuccessResponse(
      { schedule: data as NotificationScheduleRow },
      correlationId,
      201
    );
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}

export async function PATCH(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const payload = await parseJsonBody({
      request,
      schema: updateScheduleSchema,
    });

    const updatePayload: Database["public"]["Tables"]["notification_schedules"]["Update"] =
      {
        updated_at: new Date().toISOString(),
      };
    if (payload.hour !== undefined) {
      updatePayload.hour = payload.hour;
    }
    if (payload.timezone !== undefined) {
      updatePayload.timezone = payload.timezone;
    }
    if (payload.message !== undefined) {
      updatePayload.message = payload.message;
    }
    if (payload.enabled !== undefined) {
      updatePayload.enabled = payload.enabled;
    }
    if (payload.isDefault !== undefined) {
      updatePayload.is_default = payload.isDefault;
    }

    const { data, error } = await supabase
      .from("notification_schedules")
      .update(updatePayload)
      .eq("id", payload.id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) {
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "notification_schedule_update_failed",
        fallbackMessage: "Notification schedule could not be updated.",
      });
    }
    if (!data) {
      throw new ApiRouteError(
        404,
        "notification_schedule_not_found",
        "Notification schedule could not be found."
      );
    }

    return apiSuccessResponse(
      { schedule: data as NotificationScheduleRow },
      correlationId
    );
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}

export async function DELETE(request: Request) {
  const correlationId = createCorrelationId();
  try {
    const { supabase, userId } = await requireAuthenticatedRouteContext();
    const payload = await parseJsonBody({
      request,
      schema: deleteScheduleSchema,
    });

    const { data, error } = await supabase
      .from("notification_schedules")
      .delete()
      .eq("id", payload.id)
      .eq("user_id", userId)
      .eq("is_default", false)
      .select("id")
      .maybeSingle();
    if (error) {
      throw mapPostgrestWriteError({
        error,
        fallbackCode: "notification_schedule_delete_failed",
        fallbackMessage: "Notification schedule could not be deleted.",
      });
    }
    if (!data) {
      throw new ApiRouteError(
        404,
        "notification_schedule_not_found",
        "Notification schedule could not be found."
      );
    }

    return apiSuccessResponse({ success: true }, correlationId);
  } catch (error) {
    return handleApiRouteError(error, correlationId);
  }
}
