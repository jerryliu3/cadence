export interface SocialCapabilities {
  socialEnabled: boolean;
  socialFeedEnabled: boolean;
  socialChallengesEnabled: boolean;
  socialLeaderboardsEnabled: boolean;
  socialDuoEnabled: boolean;
  socialAdminEnabled: boolean;
}

function parseBooleanFlag(
  flagName: string,
  value: string | undefined,
  defaultValue: boolean
) {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return defaultValue;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  console.warn(
    `[social-capabilities] Invalid ${flagName} value "${value}", using default ${defaultValue}.`
  );
  return defaultValue;
}

export function getSocialCapabilities(): SocialCapabilities {
  return {
    socialEnabled: parseBooleanFlag(
      "SOCIAL_ENABLED",
      process.env.SOCIAL_ENABLED,
      false
    ),
    socialFeedEnabled: parseBooleanFlag(
      "SOCIAL_FEED_ENABLED",
      process.env.SOCIAL_FEED_ENABLED,
      false
    ),
    socialChallengesEnabled: parseBooleanFlag(
      "SOCIAL_CHALLENGES_ENABLED",
      process.env.SOCIAL_CHALLENGES_ENABLED,
      false
    ),
    socialLeaderboardsEnabled: parseBooleanFlag(
      "SOCIAL_LEADERBOARDS_ENABLED",
      process.env.SOCIAL_LEADERBOARDS_ENABLED,
      false
    ),
    socialDuoEnabled: parseBooleanFlag(
      "SOCIAL_DUO_ENABLED",
      process.env.SOCIAL_DUO_ENABLED,
      false
    ),
    socialAdminEnabled: parseBooleanFlag(
      "SOCIAL_ADMIN_ENABLED",
      process.env.SOCIAL_ADMIN_ENABLED,
      false
    ),
  };
}
