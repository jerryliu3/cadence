import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaderboardsPanel } from "@/features/social/leaderboards/leaderboards-panel";
import type { LeaderboardSeason, LeaderboardStanding } from "@/features/social/types";

const fetchSocialLeaderboardsMock = vi.fn();
const fetchSocialLeaderboardStandingsMock = vi.fn();

vi.mock("@/features/social/data", () => ({
  fetchSocialLeaderboards: (...args: unknown[]) => fetchSocialLeaderboardsMock(...args),
  fetchSocialLeaderboardStandings: (...args: unknown[]) =>
    fetchSocialLeaderboardStandingsMock(...args),
}));

vi.mock("@/features/social/social-freshness-indicator", () => ({
  SocialFreshnessIndicator: () => <div data-testid="social-freshness-indicator" />,
}));

function makeSeason(): LeaderboardSeason {
  return {
    id: "season-1",
    slug: "season-1",
    title: "Season 1",
    subjectKind: "user",
    metric: "total_xp",
    metricTrackKey: null,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: null,
    status: "open",
    rollover: "monthly",
    scope: "global",
    groupId: null,
  };
}

function makeStandings(): LeaderboardStanding[] {
  return [];
}

describe("LeaderboardsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the Leaderboards title when no seasons are available", async () => {
    fetchSocialLeaderboardsMock.mockResolvedValueOnce({
      schemaVersion: "1",
      items: [],
    });

    render(<LeaderboardsPanel />);

    expect(await screen.findByText("Leaderboards")).toBeInTheDocument();
    expect(
      screen.getByText("Leaderboard seasons will appear once admins publish one.")
    ).toBeInTheDocument();
  });

  it("keeps the Leaderboards title when loading seasons fails", async () => {
    fetchSocialLeaderboardsMock.mockRejectedValueOnce(
      new Error("Leaderboards service unavailable")
    );

    render(<LeaderboardsPanel />);

    expect(await screen.findByText("Leaderboards service unavailable")).toBeInTheDocument();
    expect(screen.getByText("Leaderboards")).toBeInTheDocument();
  });

  it("shows freshness indicator under the Leaderboard seasons heading", async () => {
    const season = makeSeason();
    fetchSocialLeaderboardsMock.mockResolvedValueOnce({
      schemaVersion: "1",
      items: [season],
    });
    fetchSocialLeaderboardStandingsMock.mockResolvedValueOnce({
      schemaVersion: "1",
      season,
      standings: makeStandings(),
      viewerRank: null,
    });

    render(<LeaderboardsPanel />);

    const heading = await screen.findByText("Leaderboard seasons");
    const header = heading.closest('[data-slot="card-header"]');
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByTestId("social-freshness-indicator")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchSocialLeaderboardStandingsMock).toHaveBeenCalledWith("season-1");
    });
  });
});
