import type { DuoContextLoadResult } from "@cadence/shared/social/duo";
import {
  buildDuoContextStateFromTeamRows,
  type SocialTeamStateResponse,
} from "@cadence/shared/social/team";

const EMPTY_DUO_CONTEXT = {
  activePartner: null,
  pendingInvite: null,
};

export function resolveDuoTeamLoadResult({
  socialEnabled,
  teamStateResponse,
  hasError,
}: {
  socialEnabled: boolean;
  teamStateResponse: SocialTeamStateResponse | null;
  hasError: boolean;
}): DuoContextLoadResult {
  if (!socialEnabled) {
    return { availability: "ready", state: EMPTY_DUO_CONTEXT };
  }
  if (hasError) {
    return { availability: "unavailable", state: EMPTY_DUO_CONTEXT };
  }
  return {
    availability: "ready",
    state: buildDuoContextStateFromTeamRows(teamStateResponse?.items ?? []),
  };
}
