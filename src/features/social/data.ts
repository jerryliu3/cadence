import type {
  LeaderboardSeason,
  LeaderboardStanding,
  SocialChallenge,
  SocialFeedEvent,
} from "@/features/social/types";
import type { SocialTeamStateResponse } from "@cadence/shared/social/team";
import {
  invalidateTabDataCacheByPrefix,
  readTabDataCache,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";
import { invalidateProgressContextCache } from "@/lib/goals/progress-context";

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

export type FeedReactionKind = "cheer" | "fire" | "clap" | "strong";
export const SOCIAL_TAB_CACHE_PREFIX = "social:";
const SOCIAL_FEED_CACHE_TTL_MS = 60 * 1000;

async function parseApiError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
  };
  throw new Error(errorBody.message ?? errorBody.code ?? fallbackMessage);
}

export function invalidateSocialTabCache() {
  invalidateTabDataCacheByPrefix(SOCIAL_TAB_CACHE_PREFIX);
}

async function fetchSocialCachedJson<TPayload>({
  cacheKey,
  path,
  fallbackMessage,
  ttlMs,
}: {
  cacheKey: string;
  path: string;
  fallbackMessage: string;
  ttlMs?: number;
}) {
  const cached = readTabDataCache<TPayload>(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(path, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, fallbackMessage);
  }
  const payload = (await response.json()) as TPayload;
  writeTabDataCache(cacheKey, payload, ttlMs);
  return payload;
}

export async function fetchSocialFeedPage({
  cursor,
  scope = "global",
  limit = 20,
}: {
  cursor?: string | null;
  scope?: "global" | "team" | "actor";
  limit?: number;
}) {
  const params = new URLSearchParams();
  params.set("scope", scope);
  params.set("limit", String(limit));
  if (cursor) {
    params.set("cursor", cursor);
  }
  return fetchSocialCachedJson<SocialFeedResponse>({
    cacheKey: `${SOCIAL_TAB_CACHE_PREFIX}feed:${params.toString()}`,
    path: `/api/social/feed?${params.toString()}`,
    fallbackMessage: "Failed to load feed.",
    ttlMs: SOCIAL_FEED_CACHE_TTL_MS,
  });
}

export async function fetchSocialChallenges() {
  return fetchSocialCachedJson<SocialChallengesResponse>({
    cacheKey: `${SOCIAL_TAB_CACHE_PREFIX}challenges`,
    path: "/api/social/challenges",
    fallbackMessage: "Failed to load challenges.",
  });
}

export async function fetchSocialChallengeDetail(challengeId: string) {
  return fetchSocialCachedJson<SocialChallengeDetailResponse>({
    cacheKey: `${SOCIAL_TAB_CACHE_PREFIX}challenge:${challengeId}`,
    path: `/api/social/challenges/${challengeId}`,
    fallbackMessage: "Failed to load challenge.",
  });
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
  const payload = (await response.json()) as { schemaVersion: "1"; joined: boolean };
  invalidateSocialTabCache();
  return payload;
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
  const payload = (await response.json()) as { schemaVersion: "1"; joined: boolean };
  invalidateSocialTabCache();
  return payload;
}

export async function fetchSocialLeaderboards() {
  return fetchSocialCachedJson<SocialLeaderboardsResponse>({
    cacheKey: `${SOCIAL_TAB_CACHE_PREFIX}leaderboards`,
    path: "/api/social/leaderboards",
    fallbackMessage: "Failed to load leaderboards.",
  });
}

export async function fetchSocialLeaderboardStandings(
  seasonId: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return fetchSocialCachedJson<SocialLeaderboardStandingsResponse>({
    cacheKey: `${SOCIAL_TAB_CACHE_PREFIX}standings:${seasonId}:${params.toString()}`,
    path: `/api/social/leaderboards/${seasonId}?${params.toString()}`,
    fallbackMessage: "Failed to load leaderboard standings.",
  });
}

export async function fetchSocialTeamState() {
  return fetchSocialCachedJson<SocialTeamStateResponse>({
    cacheKey: `${SOCIAL_TAB_CACHE_PREFIX}team`,
    path: "/api/social/team",
    fallbackMessage: "Failed to load team state.",
  });
}

export async function createSocialTeamInvite({
  partnerId,
  message,
}: {
  partnerId: string;
  message?: string;
}) {
  const response = await fetch("/api/social/team/invites", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partnerId, message }),
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to send team invite.");
  }
  const payload = (await response.json()) as { schemaVersion: "1"; teamId: string };
  invalidateSocialTabCache();
  return payload;
}

export async function acceptSocialTeamInvite(teamId: string) {
  const response = await fetch(`/api/social/team/invites/${teamId}/accept`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibilityAcknowledged: true }),
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to accept team invite.");
  }
  const payload = (await response.json()) as { schemaVersion: "1"; accepted: boolean };
  invalidateSocialTabCache();
  return payload;
}

export async function declineSocialTeamInvite(teamId: string) {
  const response = await fetch(`/api/social/team/invites/${teamId}/decline`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to decline team invite.");
  }
  const payload = (await response.json()) as { schemaVersion: "1"; declined: boolean };
  invalidateSocialTabCache();
  invalidateProgressContextCache();
  return payload;
}

export async function dissolveSocialTeam() {
  const response = await fetch("/api/social/team", {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to dissolve team.");
  }
  const payload = (await response.json()) as { schemaVersion: "1"; dissolved: boolean };
  invalidateSocialTabCache();
  invalidateProgressContextCache();
  return payload;
}

export async function addSocialFeedReaction({
  eventId,
  reaction,
}: {
  eventId: string;
  reaction: FeedReactionKind;
}) {
  const response = await fetch(`/api/social/feed/${eventId}/reactions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reaction }),
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to add reaction.");
  }
  const payload = (await response.json()) as { schemaVersion: "1" };
  invalidateSocialTabCache();
  return payload;
}

export async function removeSocialFeedReaction({
  eventId,
  reaction,
}: {
  eventId: string;
  reaction: FeedReactionKind;
}) {
  const response = await fetch(`/api/social/feed/${eventId}/reactions`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reaction }),
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to remove reaction.");
  }
  const payload = (await response.json()) as { schemaVersion: "1" };
  invalidateSocialTabCache();
  return payload;
}

export async function sendTeamNudge({
  toUserId,
  kind = "cheer",
  goalId,
  message,
}: {
  toUserId: string;
  kind?: "cheer" | "remind" | "custom";
  goalId?: string;
  message?: string;
}) {
  const response = await fetch("/api/social/team/nudges", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      toUserId,
      kind,
      goalId,
      message,
    }),
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to send nudge.");
  }
  const payload = (await response.json()) as { schemaVersion: "1"; nudgeId: string };
  invalidateSocialTabCache();
  return payload;
}

export async function joinSocialCohort(joinCode: string) {
  const response = await fetch("/api/social/cohorts/join", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ joinCode }),
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to join cohort.");
  }
  const payload = (await response.json()) as { schemaVersion: "1"; cohortId: string };
  invalidateSocialTabCache();
  return payload;
}
