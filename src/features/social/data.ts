import type {
  LeaderboardSeason,
  LeaderboardStanding,
  SocialChallenge,
  SocialFeedEvent,
} from "@/features/social/types";

interface SocialFeedResponse {
  schemaVersion: "1";
  items: SocialFeedEvent[];
  nextCursor: string | null;
}

interface SocialChallengesResponse {
  schemaVersion: "1";
  items: SocialChallenge[];
}

interface SocialChallengeDetailResponse {
  schemaVersion: "1";
  item: SocialChallenge;
}

interface SocialLeaderboardsResponse {
  schemaVersion: "1";
  items: LeaderboardSeason[];
}

interface SocialLeaderboardStandingsResponse {
  schemaVersion: "1";
  season: LeaderboardSeason;
  standings: LeaderboardStanding[];
  viewerRank: number | null;
}

async function parseApiError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
  };
  throw new Error(errorBody.message ?? errorBody.code ?? fallbackMessage);
}

export async function fetchSocialFeedPage({
  cursor,
  scope = "global",
  limit = 20,
}: {
  cursor?: string | null;
  scope?: "global" | "duo" | "actor";
  limit?: number;
}) {
  const params = new URLSearchParams();
  params.set("scope", scope);
  params.set("limit", String(limit));
  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(`/api/social/feed?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    await parseApiError(response, "Failed to load feed.");
  }

  return (await response.json()) as SocialFeedResponse;
}

export async function fetchSocialChallenges() {
  const response = await fetch("/api/social/challenges", {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to load challenges.");
  }
  return (await response.json()) as SocialChallengesResponse;
}

export async function fetchSocialChallengeDetail(challengeId: string) {
  const response = await fetch(`/api/social/challenges/${challengeId}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to load challenge.");
  }
  return (await response.json()) as SocialChallengeDetailResponse;
}

export async function joinSocialChallenge(challengeId: string) {
  const response = await fetch(`/api/social/challenges/${challengeId}/join`, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to join challenge.");
  }
  return (await response.json()) as { schemaVersion: "1"; joined: boolean };
}

export async function leaveSocialChallenge(challengeId: string) {
  const response = await fetch(`/api/social/challenges/${challengeId}/join`, {
    method: "DELETE",
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to leave challenge.");
  }
  return (await response.json()) as { schemaVersion: "1"; joined: boolean };
}

export async function fetchSocialLeaderboards() {
  const response = await fetch("/api/social/leaderboards", {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to load leaderboards.");
  }
  return (await response.json()) as SocialLeaderboardsResponse;
}

export async function fetchSocialLeaderboardStandings(
  seasonId: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const response = await fetch(`/api/social/leaderboards/${seasonId}?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to load leaderboard standings.");
  }
  return (await response.json()) as SocialLeaderboardStandingsResponse;
}
