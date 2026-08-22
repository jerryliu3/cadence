import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateSocialFeedCache,
  invalidateSocialTabCache,
} from "@/features/social/data";
import { SocialSurface } from "@/features/social/social-surface";
import { requestXpRefresh } from "@/lib/xp/events";

vi.mock("@/features/social/data", () => ({
  invalidateSocialFeedCache: vi.fn(),
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
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SocialSurface refresh behavior", () => {
  it("refreshes feed tab when an XP refresh event is requested", async () => {
    render(<SocialSurface initialTab="feed" />);

    await waitFor(() => {
      expect(screen.getByTestId("feed-list")).toHaveAttribute("data-refresh-token", "1");
    });
    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(1);
    const globalRefreshCount = vi.mocked(invalidateSocialTabCache).mock.calls.length;

    act(() => {
      requestXpRefresh({
        reason: "completion",
        desiredFactState: "present",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("feed-list")).toHaveAttribute("data-refresh-token", "2");
    });
    expect(invalidateSocialFeedCache).toHaveBeenCalledTimes(1);
    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(globalRefreshCount);
  });

  it("does not refresh non-feed tabs on XP refresh events", async () => {
    const user = userEvent.setup();
    render(<SocialSurface initialTab="challenges" />);

    await waitFor(() => {
      expect(invalidateSocialTabCache).toHaveBeenCalledTimes(1);
    });
    const globalRefreshCount = vi.mocked(invalidateSocialTabCache).mock.calls.length;

    await user.click(screen.getByRole("tab", { name: "Leaderboards" }));

    act(() => {
      requestXpRefresh({
        reason: "completion",
        desiredFactState: "present",
      });
    });

    expect(invalidateSocialFeedCache).not.toHaveBeenCalled();
    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(globalRefreshCount);
  });

  it("refreshes once when window focus returns within cooldown window", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    render(<SocialSurface initialTab="feed" />);

    await waitFor(() => {
      expect(screen.getByTestId("feed-list")).toHaveAttribute("data-refresh-token", "1");
    });
    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("feed-list")).toHaveAttribute("data-refresh-token", "2");
    });
    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(2);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(invalidateSocialTabCache).toHaveBeenCalledTimes(2);
    });
  });

  it("polls once per minute while the document is visible", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    render(<SocialSurface initialTab="feed" />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(invalidateSocialTabCache).toHaveBeenCalledTimes(2);
  });
});
