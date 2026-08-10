import type { GoalProgressSnapshot } from "@/lib/goals/progress";
import type {
  Completion,
  Goal,
  GoalParticipant,
  GoalShare,
  Profile,
} from "@/lib/goals/types";

export function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    owner_id: "user-1",
    title: "Run 5k",
    description: null,
    category: "health",
    color: "#10b981",
    frequency_type: "recurring",
    recurrence_interval: "daily",
    target_count: null,
    milestone_names: null,
    start_date: "2026-08-01",
    end_date: null,
    default_local_time: null,
    photo_path: null,
    is_group: false,
    is_deleted: false,
    archived_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildProgressSnapshot(
  overrides: Partial<GoalProgressSnapshot> = {}
): GoalProgressSnapshot {
  return {
    goalId: "goal-1",
    admissibleCompletionCount: 0,
    creditedUnitCount: 0,
    expectedUnitCount: 0,
    percent: 0,
    lifecycle: "active",
    outcome: "in_progress",
    placementTerminal: false,
    currentStreak: 0,
    longestStreak: 0,
    milestoneDates: [],
    ...overrides,
  };
}

export function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "user-1",
    username: "runner",
    display_name: "Runner",
    avatar_url: null,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildParticipant(
  overrides: Partial<GoalParticipant> = {}
): GoalParticipant {
  return {
    id: "participant-1",
    goal_id: "goal-1",
    user_id: "user-1",
    role: "owner",
    joined_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildGoalShare(overrides: Partial<GoalShare> = {}): GoalShare {
  return {
    id: "share-1",
    goal_id: "goal-1",
    shared_with: "user-2",
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

export function buildCompletion(overrides: Partial<Completion> = {}): Completion {
  return {
    id: "completion-1",
    goal_id: "goal-1",
    user_id: "user-1",
    completed_on: "2026-08-01",
    source: "manual",
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}
