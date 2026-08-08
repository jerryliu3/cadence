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
  it("compiles supported global planner patches", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Applied your rest-day and blackout updates.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [0, 6],
              addBlackoutRanges: [{ start: "2026-08-12", end: "2026-08-15" }],
              removeBlackoutRanges: [{ start: "2026-08-01", end: "2026-08-02" }],
            },
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Keep one full recovery day." }],
      },
    });

    expect(result.proposal.policyPatches).toEqual([
      { kind: "set_rest_weekdays", restWeekdays: [0, 6] },
      { kind: "add_blackout_range", start: "2026-08-12", end: "2026-08-15" },
      { kind: "remove_blackout_range", start: "2026-08-01", end: "2026-08-02" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("warns when action is needs_goal", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "review",
        reply: "I need a mapped goal before proposing edits.",
        proposal: {
          calendarIntent: {
            action: "needs_goal",
            global: null,
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Re-check goal mappings next turn." }],
      },
    });

    expect(result.proposal.policyPatches).toEqual([]);
    expect(result.warnings).toContain(
      "No calendar edits were generated because this plan does not map to an existing goal."
    );
  });

  it("warns when apply action has no supported changes", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "No edits applied.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [],
              addBlackoutRanges: [],
              removeBlackoutRanges: [],
            },
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Keep sessions short and frequent." }],
      },
    });

    expect(result.proposal.policyPatches).toEqual([]);
    expect(result.warnings).toContain(
      "The calendar intent did not contain any scheduling changes."
    );
  });
});
