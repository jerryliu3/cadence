import { describe, expect, it } from "vitest";
import type { Completion, Goal } from "@/lib/goals/types";
import { buildPublicProfileBundle } from "@/lib/social/public-profile";

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    owner_id: "subject-1",
    title: "Daily walk",
    description: null,
    category: "Health",
    category_key: "health",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: 1,
    milestone_names: null,
    start_date: "2026-01-01",
    end_date: null,
    photo_path: null,
    team_id: null,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCompletion(overrides: Partial<Completion> = {}): Completion {
  return {
    id: "completion-1",
    goal_id: "goal-1",
    user_id: "subject-1",
    completed_on: "2026-01-02",
    source: "manual",
    created_at: "2026-01-02T08:00:00.000Z",
    ...overrides,
  };
}

describe("buildPublicProfileBundle", () => {
  it("returns private payload for non-self viewers on hidden accounts", () => {
    const bundle = buildPublicProfileBundle({
      viewerUserId: "viewer-1",
      subjectProfile: {
        id: "subject-1",
        username: "subject",
        display_name: "Subject User",
        avatar_url: "https://example.com/avatar.png",
        social_activity_visible: false,
        week_starts_on: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        timezone: "America/New_York",
      },
      globalXpProfile: { total_xp: 480 },
      globalAchievements: [
        {
          id: "award-1",
          unlocked_at: "2026-01-05T00:00:00.000Z",
          revoked_at: null,
          xp_rewards: {
            level: 2,
            reward_code: "lv2",
            reward_title: "Level 2",
            reward_description: "Reached level 2",
          },
        },
      ],
      goals: [makeGoal()],
      completions: [makeCompletion()],
      selectedYear: 2026,
    });

    expect(bundle.profile.isPrivate).toBe(true);
    expect(bundle.xp).toBeNull();
    expect(bundle.globalAchievements).toEqual([]);
    expect(bundle.overallStats).toBeNull();
    expect(bundle.yearHeatmap).toEqual([]);
  });

  it("returns full payload for self viewers even when social visibility is disabled", () => {
    const bundle = buildPublicProfileBundle({
      viewerUserId: "subject-1",
      subjectProfile: {
        id: "subject-1",
        username: "subject",
        display_name: "Subject User",
        avatar_url: null,
        social_activity_visible: false,
        week_starts_on: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        timezone: "America/New_York",
      },
      globalXpProfile: { total_xp: 480 },
      globalAchievements: [
        {
          id: "award-1",
          unlocked_at: "2026-01-05T00:00:00.000Z",
          revoked_at: null,
          xp_rewards: {
            level: 2,
            reward_code: "lv2",
            reward_title: "Level 2",
            reward_description: "Reached level 2",
          },
        },
      ],
      goals: [makeGoal()],
      completions: [makeCompletion()],
      selectedYear: 2026,
    });

    expect(bundle.profile.isPrivate).toBe(false);
    expect(bundle.xp?.totalXp).toBe(480);
    expect(bundle.globalAchievements).toHaveLength(1);
    expect(bundle.globalAchievements[0]).toMatchObject({
      id: "award-1",
      code: "lv2",
      title: "Level 2",
    });
    expect(bundle.overallStats?.totalActivities).toBe(1);
    expect(bundle.overallStats?.todayActivities).toBeTypeOf("number");
    expect(bundle.yearHeatmap).toHaveLength(365);
    expect(
      bundle.yearHeatmap.find((entry) => entry.date === "2026-01-02")?.count
    ).toBe(1);
  });
});
