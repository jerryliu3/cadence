import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSocialFeedHead, fetchSocialFeedPage } from "@/features/social/data";
import { FeedList } from "@/features/social/feed/feed-list";

vi.mock("@/features/social/data", () => ({
  fetchSocialFeedPage: vi.fn(),
  fetchSocialFeedHead: vi.fn(),
}));

vi.mock("@/features/social/feed/feed-event-card", () => ({
  FeedEventCard: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FeedList", () => {
  it("reloads feed when refresh token changes while active", async () => {
    vi.mocked(fetchSocialFeedPage).mockResolvedValue({
      schemaVersion: "1",
      items: [],
      nextCursor: null,
    });
    vi.mocked(fetchSocialFeedHead).mockResolvedValue({
      schemaVersion: "1",
      items: [],
      nextCursor: null,
    });

    const { rerender } = render(<FeedList isActive refreshToken={0} />);
    await waitFor(() => {
      expect(fetchSocialFeedPage).toHaveBeenCalledTimes(1);
    });

    rerender(<FeedList isActive refreshToken={1} />);
    await waitFor(() => {
      expect(fetchSocialFeedPage).toHaveBeenCalledTimes(2);
    });
  });

  it("does not load feed while inactive", async () => {
    vi.mocked(fetchSocialFeedPage).mockResolvedValue({
      schemaVersion: "1",
      items: [],
      nextCursor: null,
    });
    vi.mocked(fetchSocialFeedHead).mockResolvedValue({
      schemaVersion: "1",
      items: [],
      nextCursor: null,
    });

    render(<FeedList isActive={false} refreshToken={0} />);

    await waitFor(() => {
      expect(fetchSocialFeedPage).not.toHaveBeenCalled();
    });
  });

  it("shows a refresh CTA when polling sees a new newest feed item", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchSocialFeedPage).mockResolvedValue({
      schemaVersion: "1",
      items: [
        {
          id: "event-1",
          eventType: "xp_earned",
          createdAt: "2026-01-01T00:00:00.000Z",
          actor: {
            id: "user-1",
            username: "user",
            displayName: "User",
            avatarUrl: null,
          },
          trackKey: "global",
          categoryLabel: null,
          goalTitle: null,
          xpDelta: 10,
          occurrenceCount: 1,
          reactionCount: 0,
          viewerReacted: false,
          payload: {},
        },
      ],
      nextCursor: null,
    });
    vi.mocked(fetchSocialFeedHead).mockResolvedValue({
      schemaVersion: "1",
      items: [
        {
          id: "event-2",
          eventType: "xp_earned",
          createdAt: "2026-01-01T00:00:30.000Z",
          actor: {
            id: "user-2",
            username: "user2",
            displayName: "User 2",
            avatarUrl: null,
          },
          trackKey: "global",
          categoryLabel: null,
          goalTitle: null,
          xpDelta: 5,
          occurrenceCount: 1,
          reactionCount: 0,
          viewerReacted: false,
          payload: {},
        },
      ],
      nextCursor: null,
    });

    try {
      render(<FeedList isActive refreshToken={0} />);

      await act(async () => {
        vi.runOnlyPendingTimers();
      });
      expect(fetchSocialFeedPage).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(60 * 1000);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchSocialFeedHead).toHaveBeenCalledTimes(1);

      expect(
        screen.getByRole("button", { name: "New activity available. Refresh feed." })
      ).toBeInTheDocument();

      await act(async () => {
        screen.getByRole("button", { name: "New activity available. Refresh feed." }).click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchSocialFeedPage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
