import type { DuoActivePartner } from "@cadence/shared/social/duo";
import { describe, expect, it } from "vitest";
import { resolveMobileDuoLaneSubjects } from "./lane-subjects";

const activePartner: DuoActivePartner = {
  teamId: "11111111-1111-4111-8111-111111111111",
  partnerId: "22222222-2222-4222-8222-222222222222",
  partnerUsername: "alex",
  partnerDisplayName: "Alex",
  partnerAvatarUrl: null,
};

describe("resolveMobileDuoLaneSubjects", () => {
  it("returns only the viewer lane in Solo scope", () => {
    expect(
      resolveMobileDuoLaneSubjects({
        scope: "me",
        activePartner,
      })
    ).toEqual([{ id: "viewer", label: "Solo", readOnly: false }]);
  });

  it("returns only the partner lane in Partner scope", () => {
    expect(
      resolveMobileDuoLaneSubjects({
        scope: "partner",
        activePartner,
      })
    ).toEqual([
      {
        id: "partner",
        label: "Alex",
        userId: "22222222-2222-4222-8222-222222222222",
        readOnly: true,
        avatarUrl: null,
      },
    ]);
  });

  it("returns viewer then partner lanes in Both scope", () => {
    expect(
      resolveMobileDuoLaneSubjects({
        scope: "both",
        activePartner,
      })
    ).toEqual([
      { id: "viewer", label: "Solo", readOnly: false },
      {
        id: "partner",
        label: "Alex",
        userId: "22222222-2222-4222-8222-222222222222",
        readOnly: true,
        avatarUrl: null,
      },
    ]);
  });

  it("falls back to viewer lane when no partner exists", () => {
    expect(
      resolveMobileDuoLaneSubjects({
        scope: "partner",
        activePartner: null,
      })
    ).toEqual([{ id: "viewer", label: "Solo", readOnly: false }]);
  });
});
