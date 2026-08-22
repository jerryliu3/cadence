import { render, screen, waitFor } from "@testing-library/react";
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
    vi.clearAllMocks();
  });

  it("renders freshness summary after loading", async () => {
    render(<SocialFreshnessIndicator refreshToken={0} />);

    await waitFor(() => {
      expect(screen.getByTestId("social-freshness-indicator")).toHaveTextContent(
        "Sync every 1m"
      );
    });
    expect(screen.getByTestId("social-freshness-indicator")).toHaveTextContent(
      "next run in"
    );
    expect(screen.getByTestId("social-freshness-indicator")).toHaveTextContent(
      "standings + challenges"
    );
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
});
