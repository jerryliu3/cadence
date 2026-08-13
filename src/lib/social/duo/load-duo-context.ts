import { isFeatureEnabled } from "@/lib/feature-flags";
import type { DuoContextState } from "@/lib/social/duo/types";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type TeamStateRpcRow = {
  team_id: string;
  status: "pending" | "active" | "closed";
  partner_id: string;
  partner_username: string | null;
  partner_display_name: string | null;
  partner_avatar_url: string | null;
  is_incoming: boolean;
};

const EMPTY_DUO_CONTEXT: DuoContextState = {
  activePartner: null,
  pendingInvite: null,
};

export async function loadDuoContext({
  supabase,
}: {
  supabase: ServerSupabaseClient;
}): Promise<DuoContextState> {
  if (!isFeatureEnabled("socialEnabled")) {
    return EMPTY_DUO_CONTEXT;
  }

  try {
    const { data, error } = await supabase.rpc("get_team_state");
    if (error) {
      return EMPTY_DUO_CONTEXT;
    }
    const rows = (data ?? []) as TeamStateRpcRow[];
    const active = rows.find((row) => row.status === "active") ?? null;
    const pending = rows.find((row) => row.status === "pending") ?? null;

    return {
      activePartner: active
        ? {
            teamId: active.team_id,
            partnerId: active.partner_id,
            partnerUsername: active.partner_username,
            partnerDisplayName: active.partner_display_name,
            partnerAvatarUrl: active.partner_avatar_url,
          }
        : null,
      pendingInvite: pending
        ? {
            teamId: pending.team_id,
            partnerId: pending.partner_id,
            partnerUsername: pending.partner_username,
            partnerDisplayName: pending.partner_display_name,
            partnerAvatarUrl: pending.partner_avatar_url,
            isIncoming: pending.is_incoming,
          }
        : null,
    };
  } catch {
    return EMPTY_DUO_CONTEXT;
  }
}
