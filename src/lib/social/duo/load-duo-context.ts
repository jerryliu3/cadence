import { isFeatureEnabled } from "@/lib/feature-flags";
import { reportError } from "@/lib/observability/report-error";
import type {
  DuoContextLoadResult,
} from "@cadence/shared/social/duo";
import {
  buildDuoContextStateFromTeamRows,
  mapTeamStateRpcRow,
  type TeamStateRpcRow,
} from "@cadence/shared/social/team";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const EMPTY_DUO_CONTEXT = {
  activePartner: null,
  pendingInvite: null,
};

export async function loadDuoContext({
  supabase,
}: {
  supabase: ServerSupabaseClient;
}): Promise<DuoContextLoadResult> {
  if (!isFeatureEnabled("socialEnabled")) {
    return { state: EMPTY_DUO_CONTEXT, availability: "ready" };
  }

  try {
    const { data, error } = await supabase.rpc("get_team_state");
    if (error) {
      reportError(error, { area: "duo", code: "team_state_unavailable" });
      return { state: EMPTY_DUO_CONTEXT, availability: "unavailable" };
    }
    const rows = ((data ?? []) as TeamStateRpcRow[]).map(mapTeamStateRpcRow);

    return {
      availability: "ready",
      state: buildDuoContextStateFromTeamRows(rows),
    };
  } catch (error) {
    reportError(error, { area: "duo", code: "team_state_unavailable" });
    return { state: EMPTY_DUO_CONTEXT, availability: "unavailable" };
  }
}
