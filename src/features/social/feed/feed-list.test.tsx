import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSocialFeedPage } from "@/features/social/data";
import { FeedList } from "@/features/social/feed/feed-list";

vi.mock("@/features/social/data", () => ({
  fetchSocialFeedPage: vi.fn(),
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

    render(<FeedList isActive={false} refreshToken={0} />);

    await waitFor(() => {
      expect(fetchSocialFeedPage).not.toHaveBeenCalled();
    });
  });
});
