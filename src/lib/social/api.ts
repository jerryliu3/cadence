import {
  ApiRouteError,
  requireAuthenticatedRequestContext,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";

export interface SocialRouteContext {
  userId: string;
  supabase: Awaited<
    ReturnType<typeof requireAuthenticatedRequestContext>
  >["supabase"];
}

export async function requireSocialRouteContext(
  request: Request
): Promise<SocialRouteContext> {
  const { userId, supabase } = await requireAuthenticatedRequestContext(request, {
    unauthorizedMessage: "Sign in to access social APIs.",
  });

  if (!isFeatureEnabled("socialEnabled")) {
    throw new ApiRouteError(503, "social_disabled", "Social is not enabled.");
  }

  return {
    userId,
    supabase,
  };
}
