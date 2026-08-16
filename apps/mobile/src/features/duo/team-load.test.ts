import { describe, expect, it } from "vitest";
import type { SocialTeamStateResponse } from "@cadence/shared/social/team";
import { resolveDuoTeamLoadResult } from "./team-load";

describe("resolveDuoTeamLoadResult", () => {
  it("returns ready empty state when social is disabled", () => {
    expect(
      resolveDuoTeamLoadResult({
        socialEnabled: false,
        teamStateResponse: null,
        hasError: false,
      })
    ).toEqual({
      availability: "ready",
      state: { activePartner: null, pendingInvite: null },
    });
  });

  it("returns ready team state when the response succeeds", () => {
    const teamStateResponse: SocialTeamStateResponse = {
      schemaVersion: "1",
      items: [
        {
          teamId: "11111111-1111-4111-8111-111111111111",
          status: "active",
          partnerId: "22222222-2222-4222-8222-222222222222",
          partnerUsername: "alex",
          partnerDisplayName: "Alex",
          partnerAvatarUrl: null,
          inviteMessage: null,
          invitedAt: "2026-01-01T00:00:00.000Z",
          acceptedAt: "2026-01-01T00:01:00.000Z",
          closedAt: null,
          isIncoming: false,
          teamXp: 55,
        },
      ],
    };

    expect(
      resolveDuoTeamLoadResult({
        socialEnabled: true,
        teamStateResponse,
        hasError: false,
      })
    ).toEqual({
      availability: "ready",
      state: {
        activePartner: {
          teamId: "11111111-1111-4111-8111-111111111111",
          partnerId: "22222222-2222-4222-8222-222222222222",
          partnerUsername: "alex",
          partnerDisplayName: "Alex",
          partnerAvatarUrl: null,
          teamXp: 55,
          teamXpSince: "2026-01-01T00:01:00.000Z",
        },
        pendingInvite: null,
      },
    });
  });

  it("returns unavailable when team load fails", () => {
    expect(
      resolveDuoTeamLoadResult({
        socialEnabled: true,
        teamStateResponse: null,
        hasError: true,
      })
    ).toEqual({
      availability: "unavailable",
      state: { activePartner: null, pendingInvite: null },
    });
  });
});
