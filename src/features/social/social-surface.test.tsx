import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateSocialTabCache } from "@/features/social/data";
import { SocialSurface } from "@/features/social/social-surface";
import { requestXpRefresh } from "@/lib/xp/events";

vi.mock("@/features/social/data", () => ({
  invalidateSocialTabCache: vi.fn(),
}));

vi.mock("@/features/social/feed/feed-list", () => ({
  FeedList: ({
    isActive,
    refreshToken,
  }: {
    isActive?: boolean;
    refreshToken?: number;
  }) => (
    <div
      data-testid="feed-list"
      data-is-active={String(isActive)}
      data-refresh-token={String(refreshToken)}
    />
  ),
}));

vi.mock("@/features/social/challenges/challenge-list", () => ({
  ChallengeList: () => <div data-testid="challenge-list" />,
}));

vi.mock("@/features/social/leaderboards/leaderboards-panel", () => ({
  LeaderboardsPanel: () => <div data-testid="leaderboards-panel" />,
}));

vi.mock("@/features/social/team/team-panel", () => ({
  TeamPanel: () => <div data-testid="team-panel" />,
}));

vi.mock("@/features/social/group-join-card", () => ({
  GroupJoinCard: () => <div data-testid="group-join-card" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SocialSurface refresh behavior", () => {
  it("refreshes active tab when an XP refresh event is requested", async () => {
    render(<SocialSurface initialTab="feed" />);

    expect(screen.getByTestId("feed-list")).toHaveAttribute("data-refresh-token", "0");

    act(() => {
      requestXpRefresh({
        reason: "completion",
        desiredFactState: "present",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("feed-list")).toHaveAttribute("data-refresh-token", "1");
    });
    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(1);
  });

  it("refreshes once when window focus returns within cooldown window", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    render(<SocialSurface initialTab="feed" />);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("feed-list")).toHaveAttribute("data-refresh-token", "1");
    });
    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(invalidateSocialTabCache).toHaveBeenCalledTimes(1);
    });
  });
});
