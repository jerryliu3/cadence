import { ApiRouteError } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type RpcErrorLike = {
  message: string;
};

type TeamStateRpcRow = {
  team_id: string;
  status: "pending" | "active" | "closed";
  partner_id: string;
  partner_username: string | null;
  partner_display_name: string | null;
  partner_avatar_url: string | null;
  invite_message: string | null;
  invited_at: string;
  accepted_at: string | null;
  closed_at: string | null;
  is_incoming: boolean;
};

export interface ActiveTeamPartner {
  teamId: string;
  partnerId: string;
  partnerUsername: string | null;
  partnerDisplayName: string | null;
  partnerAvatarUrl: string | null;
}

export function mapTeamStateError(error: RpcErrorLike) {
  if (error.message === "authentication_required") {
    return new ApiRouteError(401, "authentication_required", "You must be signed in.");
  }
  return new ApiRouteError(500, "team_state_unavailable", "Team state is unavailable.", {
    cause: error.message,
  });
}

export async function resolveActiveTeamPartner({
  supabase,
}: {
  supabase: ServerSupabaseClient;
}): Promise<ActiveTeamPartner | null> {
  const { data, error } = await supabase.rpc("get_team_state");
  if (error) {
    throw mapTeamStateError(error);
  }

  const active = ((data ?? []) as TeamStateRpcRow[]).find(
    (row) => row.status === "active"
  );
  if (!active) {
    return null;
  }

  return {
    teamId: active.team_id,
    partnerId: active.partner_id,
    partnerUsername: active.partner_username,
    partnerDisplayName: active.partner_display_name,
    partnerAvatarUrl: active.partner_avatar_url,
  };
}

export async function requireTeamPartner({
  supabase,
  subjectUserId,
}: {
  supabase: ServerSupabaseClient;
  subjectUserId: string;
}): Promise<ActiveTeamPartner> {
  const activePartner = await resolveActiveTeamPartner({ supabase });
  if (!activePartner || activePartner.partnerId !== subjectUserId) {
    throw new ApiRouteError(
      403,
      "not_team_partner",
      "Partner progress is available only for your active team partner."
    );
  }
  return activePartner;
}
