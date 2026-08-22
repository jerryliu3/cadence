import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSocialFreshness } from "@/features/social/data";
import { SocialFreshnessIndicator } from "@/features/social/social-freshness-indicator";

vi.mock("@/features/social/data", () => ({
  fetchSocialFreshness: vi.fn(),
}));

describe("SocialFreshnessIndicator", () => {
  beforeEach(() => {
    vi.mocked(fetchSocialFreshness).mockResolvedValue({
      schemaVersion: "1",
      freshness: {
        serverNow: "2026-08-22T15:45:21.000Z",
        nextExpectedRefreshAt: "2026-08-22T15:46:00.000Z",
        leaderboardRefreshedAt: "2026-08-22T15:44:05.000Z",
        challengesRefreshedAt: "2026-08-22T15:44:35.000Z",
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders freshness summary after loading", async () => {
    render(<SocialFreshnessIndicator refreshToken={0} />);

    await waitFor(() => {
      expect(screen.getByTestId("social-freshness-indicator")).toHaveTextContent(
        /Sync every minute \(\d+s\)/
      );
    });
    expect(screen.getByTestId("social-freshness-indicator")).not.toHaveTextContent(
      "standings + challenges"
    );
    expect(screen.getByTestId("social-freshness-status-dot")).toHaveClass(
      "bg-emerald-500"
    );
  });

  it("requests refresh and reloads freshness when countdown hits zero", async () => {
    vi.mocked(fetchSocialFreshness)
      .mockResolvedValueOnce({
        schemaVersion: "1",
        freshness: {
          serverNow: "2026-08-22T15:46:00.000Z",
          nextExpectedRefreshAt: "2026-08-22T15:46:00.000Z",
          leaderboardRefreshedAt: "2026-08-22T15:44:05.000Z",
          challengesRefreshedAt: "2026-08-22T15:44:35.000Z",
        },
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        freshness: {
          serverNow: "2026-08-22T15:46:00.000Z",
          nextExpectedRefreshAt: "2026-08-22T15:47:00.000Z",
          leaderboardRefreshedAt: "2026-08-22T15:45:05.000Z",
          challengesRefreshedAt: "2026-08-22T15:45:35.000Z",
        },
      });
    const onRefreshRequested = vi.fn();

    render(
      <SocialFreshnessIndicator
        refreshToken={0}
        onRefreshRequested={onRefreshRequested}
      />
    );
    await waitFor(() => {
      expect(onRefreshRequested).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(fetchSocialFreshness).toHaveBeenCalledTimes(2);
    });
  });

  it("re-fetches freshness when refreshToken changes", async () => {
    const { rerender } = render(<SocialFreshnessIndicator refreshToken={0} />);

    await waitFor(() => {
      expect(fetchSocialFreshness).toHaveBeenCalledTimes(1);
    });

    rerender(<SocialFreshnessIndicator refreshToken={1} />);
    await waitFor(() => {
      expect(fetchSocialFreshness).toHaveBeenCalledTimes(2);
    });
  });

  it("shows a red status dot when freshness fetch fails", async () => {
    vi.mocked(fetchSocialFreshness).mockRejectedValueOnce(
      new Error("Freshness endpoint unavailable")
    );

    render(<SocialFreshnessIndicator refreshToken={0} />);

    await waitFor(() => {
      expect(screen.getByTestId("social-freshness-indicator")).toHaveTextContent(
        "Freshness details are temporarily unavailable."
      );
    });
    expect(screen.getByTestId("social-freshness-status-dot")).toHaveClass(
      "bg-destructive"
    );
  });
});
