import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamPanel } from "./team-panel";

const mocks = vi.hoisted(() => ({
  fetchSocialTeamState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/social/data", () => ({
  acceptSocialTeamInvite: vi.fn(),
  createSocialTeamInvite: vi.fn(),
  declineSocialTeamInvite: vi.fn(),
  dissolveSocialTeam: vi.fn(),
  fetchSocialTeamState: mocks.fetchSocialTeamState,
}));

vi.mock("@/features/social/team/nudge-button", () => ({
  NudgeButton: () => <button type="button">Send nudge</button>,
}));

describe("TeamPanel", () => {
  beforeEach(() => {
    mocks.fetchSocialTeamState.mockResolvedValue({
      schemaVersion: "1",
      items: [
        {
          teamId: "team-1",
          status: "active",
          partnerId: "partner-1",
          partnerUsername: "partner",
          partnerDisplayName: "Partner",
          partnerAvatarUrl: null,
          inviteMessage: null,
          invitedAt: "2026-08-10T00:00:00.000Z",
          acceptedAt: "2026-08-12T14:30:00.000Z",
          closedAt: null,
          isIncoming: true,
          teamXp: 55,
        },
      ],
    });
  });

  it("shows accumulated team XP in the current team section", async () => {
    render(<TeamPanel />);

    expect(await screen.findByText("Team XP")).toBeInTheDocument();
    expect(screen.getByText("55 XP")).toBeInTheDocument();
  });
});
