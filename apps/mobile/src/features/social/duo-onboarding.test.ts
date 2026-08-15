import { describe, expect, it, vi } from "vitest";
import {
  buildDuoInviteInput,
  searchDuoPartners,
  type DuoPartnerSearchResult,
} from "./duo-onboarding";

const partner: DuoPartnerSearchResult = {
  id: "partner-1",
  username: "alex",
  display_name: "Alex",
  avatar_url: null as unknown as string,
  created_at: "2026-08-01T00:00:00.000Z",
};

describe("Duo onboarding", () => {
  it("normalizes username searches and excludes the viewer", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ ...partner, id: "viewer-1" }, partner],
      error: null,
    }));

    await expect(
      searchDuoPartners({
        client: { rpc },
        query: " @Alex ",
        viewerUserId: "viewer-1",
      })
    ).resolves.toEqual([partner]);
    expect(rpc).toHaveBeenCalledWith("find_profile_by_username", {
      p_query: "alex",
      p_limit: 10,
    });
  });

  it("returns an empty result set without searching empty input", async () => {
    const rpc = vi.fn();

    await expect(
      searchDuoPartners({
        client: { rpc },
        query: " ",
        viewerUserId: "viewer-1",
      })
    ).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("builds invites from the selected result and rejects self-selection", () => {
    expect(
      buildDuoInviteInput({
        selectedProfile: partner,
        viewerUserId: "viewer-1",
        message: " Let's team up ",
      })
    ).toEqual({
      partnerUsername: "alex",
      message: "Let's team up",
    });
    expect(() =>
      buildDuoInviteInput({
        selectedProfile: { ...partner, id: "viewer-1" },
        viewerUserId: "viewer-1",
        message: "",
      })
    ).toThrow("Select another Cadence user to invite.");
  });
});
