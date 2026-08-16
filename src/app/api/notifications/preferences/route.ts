import {
  ApiRouteError,
  apiSuccessResponse,
  parseJsonBody,
  requireAuthenticatedRequestContext,
  withRoute,
} from "@/lib/api/route";
import {
  normalizeNotificationPreferences,
  notificationPreferencesRequestSchema,
  type NotificationPreferencesResponsePayload,
} from "@/lib/notifications/preferences";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { supabase, userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to manage notification preferences.",
    });

    const { data, error } = await supabase
      .from("profiles")
      .select("notification_preferences")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new ApiRouteError(
        500,
        "notification_preferences_load_failed",
        "Could not load notification preferences.",
        undefined,
        error
      );
    }

    if (!data) {
      throw new ApiRouteError(404, "profile_not_found", "Profile not found.");
    }

    const payload: NotificationPreferencesResponsePayload = {
      notificationPreferences: normalizeNotificationPreferences(
        data.notification_preferences
      ),
    };

    return apiSuccessResponse(payload, correlationId);
  });
}

export async function PUT(request: Request) {
  return withRoute(async ({ correlationId }) => {
    const { supabase, userId } = await requireAuthenticatedRequestContext(request, {
      unauthorizedMessage: "Sign in to manage notification preferences.",
    });
    const body = await parseJsonBody({
      request,
      schema: notificationPreferencesRequestSchema,
      maxBytes: 8 * 1024,
    });

    const { data, error } = await supabase
      .from("profiles")
      .update({
        notification_preferences: body.notificationPreferences,
      })
      .eq("id", userId)
      .select("notification_preferences")
      .maybeSingle();

    if (error) {
      throw new ApiRouteError(
        500,
        "notification_preferences_save_failed",
        "Could not save notification preferences.",
        undefined,
        error
      );
    }

    if (!data) {
      throw new ApiRouteError(404, "profile_not_found", "Profile not found.");
    }

    const payload: NotificationPreferencesResponsePayload = {
      notificationPreferences: normalizeNotificationPreferences(
        data.notification_preferences
      ),
    };

    return apiSuccessResponse(payload, correlationId);
  });
}
