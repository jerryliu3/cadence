import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicProfileSheet } from "@/features/social/public-profile/public-profile-sheet";

const mocks = vi.hoisted(() => ({
  fetchPublicProfileBundle: vi.fn(),
}));

vi.mock("@/features/social/public-profile/data", () => ({
  fetchPublicProfileBundle: mocks.fetchPublicProfileBundle,
}));

vi.mock("@/features/goals/goal-route-sheet", () => ({
  GoalRouteSheet: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock("@/components/xp/xp-progress-card", () => ({
  XpProgressCard: () => <div>xp-card</div>,
}));

vi.mock("@/features/achievements/global-achievements-card", () => ({
  GlobalAchievementsCard: () => <div>achievements-card</div>,
}));

vi.mock("@/features/insights/insights-overall-stats-card", () => ({
  InsightsOverallStatsCard: () => <div>overall-stats-card</div>,
}));

describe("PublicProfileSheet", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows private account copy when profile is private", async () => {
    mocks.fetchPublicProfileBundle.mockResolvedValue({
      schemaVersion: "1",
      profile: {
        subjectUserId: "11111111-1111-4111-8111-111111111111",
        username: "hidden-user",
        displayName: "Hidden User",
        avatarUrl: null,
        isPrivate: true,
      },
      xp: null,
      globalAchievements: [],
      overallStats: null,
      yearHeatmap: [],
    });

    render(
      <PublicProfileSheet
        subjectUserId="11111111-1111-4111-8111-111111111111"
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText("This account is private")).toBeInTheDocument();
    expect(screen.queryByText("xp-card")).not.toBeInTheDocument();
  });

  it("renders profile sections for public accounts", async () => {
    mocks.fetchPublicProfileBundle.mockResolvedValue({
      schemaVersion: "1",
      profile: {
        subjectUserId: "22222222-2222-4222-8222-222222222222",
        username: "visible-user",
        displayName: "Visible User",
        avatarUrl: null,
        isPrivate: false,
      },
      xp: {
        totalXp: 1200,
        currentLevel: 5,
        currentLevelMinXp: 1000,
        nextLevel: 6,
        nextLevelMinXp: 1500,
        xpToNextLevel: 300,
      },
      globalAchievements: [],
      overallStats: {
        totalActivities: 20,
        totalGoalsCompleted: 4,
        todayActivities: 1,
        activeStreakDays: 3,
        currentWeekActivities: {
          current: 7,
          previous: 5,
          delta: 2,
          deltaPercent: 40,
        },
        currentMonthActivities: {
          current: 15,
          previous: 12,
          delta: 3,
          deltaPercent: 25,
        },
      },
      yearHeatmap: [{ date: "2026-01-01", count: 1 }],
    });

    render(
      <PublicProfileSheet
        subjectUserId="22222222-2222-4222-8222-222222222222"
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText("xp-card")).toBeInTheDocument();
    expect(screen.getByText("achievements-card")).toBeInTheDocument();
    expect(screen.getByText("overall-stats-card")).toBeInTheDocument();
  });
});
