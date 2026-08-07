import { describe, expect, it } from "vitest";
import { sanitizeCoachTurn } from "@/lib/planner/coach";
import type { Goal } from "@/lib/goals/types";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "12000000-0000-4000-8000-000000000001",
    owner_id: "11111111-1111-4111-8111-111111111111",
    title: "Running",
    description: null,
    category: "Health",
    color: null,
    frequency_type: "recurring",
    recurrence_interval: "weekly",
    target_count: 10,
    milestone_names: null,
    start_date: "2026-08-01",
    end_date: "2026-10-31",
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

describe("sanitizeCoachTurn", () => {
  it("compiles global and multi-goal intents in one turn", () => {
    const goalA = goal();
    const goalB = goal({
      id: "12000000-0000-4000-8000-000000000002",
      title: "Strength",
      target_count: 6,
    });
    const result = sanitizeCoachTurn({
      goalsById: new Map(
        [goalA, goalB].map((entry) => [entry.id, entry] as const)
      ),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Applied your weekly and monthly updates.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [0, 6],
              spacingStrategy: "even",
              datePreferences: [],
            },
            goals: [
              {
                targetGoalId: goalA.id,
                allowedWeekdays: [1, 3, 5],
                spacingStrategy: "flexible",
                datePreferences: [],
                monthlyDistribution: [
                  { month: "2026-08", count: 2 },
                  { month: "2026-09", count: 2 },
                ],
              },
              {
                targetGoalId: goalB.id,
                allowedWeekdays: [1, 2, 4],
                spacingStrategy: "unchanged",
                datePreferences: [],
                monthlyDistribution: [],
              },
            ],
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Keep one full recovery day." }],
      },
    });

    expect(result.proposal.policyPatches).toEqual(
      expect.arrayContaining([
        { kind: "set_rest_weekdays", restWeekdays: [0, 6] },
        { kind: "set_spacing_strategy", spacingStrategy: "even" },
        {
          kind: "set_goal_allowed_weekdays",
          goalId: goalA.id,
          weekdays: [1, 3, 5],
        },
        {
          kind: "set_goal_spacing_strategy",
          goalId: goalA.id,
          spacingStrategy: "flexible",
        },
        {
          kind: "set_goal_allowed_weekdays",
          goalId: goalB.id,
          weekdays: [1, 2, 4],
        },
        {
          kind: "set_goal_monthly_distribution",
          goalId: goalA.id,
          distribution: [
            { month: "2026-08", count: 5 },
            { month: "2026-09", count: 5 },
          ],
        },
      ])
    );
    expect(result.warnings).toContain(
      "Adjusted monthly distribution to match target count 10."
    );
  });

  it("warns and skips unknown goal entries while applying valid edits", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "review",
        reply: "Applied what I could.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: null,
            goals: [
              {
                targetGoalId: "12000000-0000-4000-8000-000000000999",
                allowedWeekdays: [1, 3],
                spacingStrategy: "even",
                datePreferences: [],
                monthlyDistribution: [],
              },
              {
                targetGoalId: goalA.id,
                allowedWeekdays: [2, 4],
                spacingStrategy: "front_load",
                datePreferences: [],
                monthlyDistribution: [],
              },
            ],
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Re-check goal mappings next turn." }],
      },
    });

    expect(result.proposal.policyPatches).toEqual(
      expect.arrayContaining([
        {
          kind: "set_goal_allowed_weekdays",
          goalId: goalA.id,
          weekdays: [2, 4],
        },
        {
          kind: "set_goal_spacing_strategy",
          goalId: goalA.id,
          spacingStrategy: "front_load",
        },
      ])
    );
    expect(result.warnings).toContain(
      "Skipped one goal-level edit because the selected goal is not in the current planner scope."
    );
  });

  it("keeps legacy calendar intent envelopes backward compatible", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Applied your running weekdays.",
        proposal: {
          calendarIntent: {
            action: "apply_to_goal",
            targetGoalId: goalA.id,
            allowedWeekdays: [1, 3, 5],
            restWeekdays: [],
            spacingStrategy: "even",
            datePreferences: [],
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Keep sessions short and frequent." }],
      },
    });

    expect(result.proposal.policyPatches).toEqual(
      expect.arrayContaining([
        {
          kind: "set_goal_allowed_weekdays",
          goalId: goalA.id,
          weekdays: [1, 3, 5],
        },
        {
          kind: "set_goal_spacing_strategy",
          goalId: goalA.id,
          spacingStrategy: "even",
        },
      ])
    );
  });
});
