import {
  ApiRouteError,
  requireAuthenticatedRouteContext,
} from "@/lib/api/route";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface SocialRouteContext {
  userId: string;
  supabase: ServerSupabaseClient;
}

export async function requireSocialRouteContext({
  supabase,
}: {
  supabase: ServerSupabaseClient;
}): Promise<SocialRouteContext> {
  const { userId } = await requireAuthenticatedRouteContext({
    supabase,
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
