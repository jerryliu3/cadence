import { ApiRouteError } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";
import {
  mapTeamStateRpcRow,
  toActiveTeamPartner,
  type TeamStateRpcRow,
} from "@cadence/shared/social/team";
import type { DuoActivePartner } from "@cadence/shared/social/duo";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type RpcErrorLike = {
  message: string;
};

export type ActiveTeamPartner = DuoActivePartner;

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

  const active = ((data ?? []) as TeamStateRpcRow[])
    .map(mapTeamStateRpcRow)
    .find((row) => row.status === "active");
  if (!active) {
    return null;
  }

  return toActiveTeamPartner(active);
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
