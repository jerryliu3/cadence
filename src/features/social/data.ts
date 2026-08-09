import type {
  LeaderboardSeason,
  LeaderboardStanding,
  TeamStateRow,
  SocialChallenge,
  SocialFeedEvent,
  TeamPartnerPlanItem,
  TeamPlannerProposal,
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

interface SocialTeamStateResponse {
  schemaVersion: "1";
  items: TeamStateRow[];
}

interface SocialTeamPartnerPlanResponse {
  schemaVersion: "1";
  scopeMonth: string;
  items: TeamPartnerPlanItem[];
}

interface SocialTeamPlannerProposalsResponse {
  schemaVersion: "1";
  items: TeamPlannerProposal[];
}

export type FeedReactionKind = "cheer" | "fire" | "clap" | "strong";

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
  scope?: "global" | "team" | "actor";
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

export async function fetchSocialTeamState() {
  const response = await fetch("/api/social/team", {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to load team state.");
  }
  return (await response.json()) as SocialTeamStateResponse;
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
  return (await response.json()) as { schemaVersion: "1"; teamId: string };
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
  return (await response.json()) as { schemaVersion: "1"; accepted: boolean };
}

export async function declineSocialTeamInvite(teamId: string) {
  const response = await fetch(`/api/social/team/invites/${teamId}/decline`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to decline team invite.");
  }
  return (await response.json()) as { schemaVersion: "1"; declined: boolean };
}

export async function dissolveSocialTeam() {
  const response = await fetch("/api/social/team", {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to dissolve team.");
  }
  return (await response.json()) as { schemaVersion: "1"; dissolved: boolean };
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
  return (await response.json()) as { schemaVersion: "1" };
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
  return (await response.json()) as { schemaVersion: "1" };
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
  return (await response.json()) as { schemaVersion: "1"; nudgeId: string };
}

export async function fetchTeamPartnerPlan(scopeMonth: string) {
  const params = new URLSearchParams();
  params.set("scopeMonth", scopeMonth);
  const response = await fetch(`/api/social/team/plan?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to load partner plan.");
  }
  return (await response.json()) as SocialTeamPartnerPlanResponse;
}

export async function fetchTeamPlannerProposals(scopeMonth?: string) {
  const params = new URLSearchParams();
  if (scopeMonth) {
    params.set("scopeMonth", scopeMonth);
  }
  const response = await fetch(`/api/social/team/planner-proposals?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to load planner proposals.");
  }
  return (await response.json()) as SocialTeamPlannerProposalsResponse;
}

export async function createTeamPlannerProposal(payload: {
  targetOwnerId: string;
  scopeMonth: string;
  operations: Array<Record<string, unknown>>;
  note?: string;
}) {
  const response = await fetch("/api/social/team/planner-proposals", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to create planner proposal.");
  }
  return (await response.json()) as { schemaVersion: "1"; proposalId: string };
}

export async function acceptTeamPlannerProposal(proposalId: string) {
  const response = await fetch(`/api/social/team/planner-proposals/${proposalId}/accept`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to accept planner proposal.");
  }
  return (await response.json()) as {
    schemaVersion: "1";
    proposalId: string;
    accepted: boolean;
    scheduleDigest: string | null;
  };
}

export async function rejectTeamPlannerProposal(proposalId: string) {
  const response = await fetch(`/api/social/team/planner-proposals/${proposalId}/reject`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to reject planner proposal.");
  }
  return (await response.json()) as { schemaVersion: "1"; proposalId: string; rejected: boolean };
}

export async function withdrawTeamPlannerProposal(proposalId: string) {
  const response = await fetch(`/api/social/team/planner-proposals/${proposalId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    await parseApiError(response, "Failed to withdraw planner proposal.");
  }
  return (await response.json()) as { schemaVersion: "1"; proposalId: string; withdrawn: boolean };
}

