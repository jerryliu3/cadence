import { RouteError } from "@/lib/api/errors";
import { requireAuthenticatedUser } from "@/lib/api/context";
import { getSocialCapabilities, type SocialCapabilities } from "@/lib/social/capabilities";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface SocialRouteContext {
  userId: string;
  supabase: ServerSupabaseClient;
  capabilities: SocialCapabilities;
}

export async function requireSocialRouteContext({
  supabase,
  requireFeed = false,
  requireChallenges = false,
  requireLeaderboards = false,
  requireDuo = false,
}: {
  supabase: ServerSupabaseClient;
  requireFeed?: boolean;
  requireChallenges?: boolean;
  requireLeaderboards?: boolean;
  requireDuo?: boolean;
}): Promise<SocialRouteContext> {
  const { userId } = await requireAuthenticatedUser(supabase, {
    message: "Sign in to access social APIs.",
  });
  const capabilities = getSocialCapabilities();

  if (!capabilities.socialEnabled) {
    throw new RouteError(503, "social_disabled", "Social is not enabled.");
  }
  if (requireFeed && !capabilities.socialFeedEnabled) {
    throw new RouteError(503, "social_feed_disabled", "Social feed is not enabled.");
  }
  if (requireChallenges && !capabilities.socialChallengesEnabled) {
    throw new RouteError(
      503,
      "social_challenges_disabled",
      "Social challenges are not enabled."
    );
  }
  if (requireLeaderboards && !capabilities.socialLeaderboardsEnabled) {
    throw new RouteError(
      503,
      "social_leaderboards_disabled",
      "Social leaderboards are not enabled."
    );
  }
  if (requireDuo && !capabilities.socialDuoEnabled) {
    throw new RouteError(503, "social_duo_disabled", "Duo features are not enabled.");
  }

  return {
    userId,
    supabase,
    capabilities,
  };
}
