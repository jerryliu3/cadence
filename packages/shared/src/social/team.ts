import type {
  DuoActivePartner,
  DuoContextState,
  DuoPendingInvite,
} from "./duo";

export type TeamStatus = "pending" | "active" | "closed";

export const TEAM_NUDGE_USER_TEXT_MAX_LENGTH = 90;

export function buildTeamNudgeContent(message?: string) {
  const userText = (message ?? "")
    .trim()
    .slice(0, TEAM_NUDGE_USER_TEXT_MAX_LENGTH);
  return userText.length > 0
    ? {
        kind: "custom" as const,
        message: `Your partner sent a nudge to keep momentum going. ${userText}`,
      }
    : {
        kind: "cheer" as const,
        message: undefined,
      };
}

/**
 * DUO_CAP(private.max_team_size): duo-shaped view of a team.
 *
 * The SQL layer is general — `team_members`, `is_active_team_member`, scoring,
 * and visibility all work for N members. This DTO is not: `partner*` is a single
 * other member, and `get_team_state` picks the lowest `user_id` above a cap of 2.
 *
 * This is the seam to change when `private.max_team_size()` is raised. Grep
 * DUO_CAP in supabase/migrations for the matching SQL sites.
 */
export interface TeamStateRow {
  teamId: string;
  status: TeamStatus;
  partnerId: string;
  partnerUsername: string | null;
  partnerDisplayName: string | null;
  partnerAvatarUrl: string | null;
  inviteMessage: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  isIncoming: boolean;
}

export interface SocialTeamStateResponse {
  schemaVersion: "1";
  items: TeamStateRow[];
}

export interface TeamStateRpcRow {
  team_id: string;
  status: TeamStatus;
  partner_id: string;
  partner_username: string | null;
  partner_display_name: string | null;
  partner_avatar_url: string | null;
  invite_message: string | null;
  invited_at: string;
  accepted_at: string | null;
  closed_at: string | null;
  is_incoming: boolean;
}

export function mapTeamStateRpcRow(row: TeamStateRpcRow): TeamStateRow {
  return {
    teamId: row.team_id,
    status: row.status,
    partnerId: row.partner_id,
    partnerUsername: row.partner_username,
    partnerDisplayName: row.partner_display_name,
    partnerAvatarUrl: row.partner_avatar_url,
    inviteMessage: row.invite_message,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    closedAt: row.closed_at,
    isIncoming: row.is_incoming,
  };
}

export function toActiveTeamPartner(row: TeamStateRow): DuoActivePartner {
  return {
    teamId: row.teamId,
    partnerId: row.partnerId,
    partnerUsername: row.partnerUsername,
    partnerDisplayName: row.partnerDisplayName,
    partnerAvatarUrl: row.partnerAvatarUrl,
  };
}

export function toPendingTeamInvite(row: TeamStateRow): DuoPendingInvite {
  return {
    teamId: row.teamId,
    partnerId: row.partnerId,
    partnerUsername: row.partnerUsername,
    partnerDisplayName: row.partnerDisplayName,
    partnerAvatarUrl: row.partnerAvatarUrl,
    isIncoming: row.isIncoming,
  };
}

export function buildDuoContextStateFromTeamRows(
  rows: TeamStateRow[]
): DuoContextState {
  const active = rows.find((row) => row.status === "active") ?? null;
  const pending = rows.find((row) => row.status === "pending") ?? null;
  return {
    activePartner: active ? toActiveTeamPartner(active) : null,
    pendingInvite: pending ? toPendingTeamInvite(pending) : null,
  };
}
