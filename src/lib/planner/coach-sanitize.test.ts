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
    expect(result.reply).toContain(
      "No calendar edits were applied because the proposal did not contain valid policy or item-level scheduling edits."
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
    expect(result.reply).toContain(
      "No calendar edits were applied because the proposal did not contain valid policy or item-level scheduling edits."
    );
  });

  it("keeps valid item edits when sibling items are malformed", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "I scheduled your existing sessions where possible.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [],
              addBlackoutRanges: [],
              removeBlackoutRanges: [],
            },
            items: [
              {
                goalId: goalA.id,
                unitKey: "cadence:2026-08-11",
                scheduledDate: "2026-08-12",
              },
              {
                goalId: goalA.id,
                unitKey: "cadence:2026-08-18",
                scheduledDate: "2026-08-19",
                reason: "Shifted to reduce load spikes",
              },
              {
                goalId: goalA.id,
                unitKey: "cadence:2026-08-25",
                scheduledDate: "next Tuesday",
              },
            ],
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Keep recovery easy after harder days." }],
      },
    });

    expect(result.proposal.draftCommands).toEqual([
      expect.objectContaining({
        kind: "move_item",
        goalId: goalA.id,
        unitKey: "cadence:2026-08-11",
        scheduledDate: "2026-08-12",
      }),
    ]);
    expect(result.warnings).toContain(
      "Some proposed item edits were skipped because they were not supported."
    );
    expect(result.reply).toBe("I scheduled your existing sessions where possible.");
  });

  it("supports explicit local-time clear sentinel in item edits", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Cleared the time override for that session.",
        proposal: {
          calendarIntent: {
            action: "apply",
            items: [
              {
                goalId: goalA.id,
                unitKey: "cadence:2026-08-11",
                localTime: "__clear_time__",
              },
            ],
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Leave one untimed session for flexibility." }],
      },
    });

    expect(result.proposal.draftCommands).toEqual([
      expect.objectContaining({
        kind: "clear_item_time_override",
        goalId: goalA.id,
        unitKey: "cadence:2026-08-11",
      }),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts missing global and normalizes string recommendations", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "I shifted one session.",
        proposal: {
          calendarIntent: {
            action: "apply",
            items: [
              {
                goalId: goalA.id,
                unitKey: "cadence:2026-08-11",
                scheduledDate: "2026-08-12",
              },
            ],
          },
        },
        recommendations: ["Keep one easy day after each harder session."],
      },
    });

    expect(result.proposal.draftCommands).toEqual([
      expect.objectContaining({
        kind: "move_item",
        goalId: goalA.id,
        unitKey: "cadence:2026-08-11",
        scheduledDate: "2026-08-12",
      }),
    ]);
    expect(result.proposal.policyPatches).toEqual([]);
    expect(result.proposal.unresolvedQuestions).toEqual([]);
    expect(result.recommendations).toEqual([
      { text: "Keep one easy day after each harder session." },
    ]);
  });

  it("accepts partial global payloads with only rest weekdays", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "I set weekend recovery days.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [0, 6],
            },
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Protect recovery quality on weekends." }],
      },
    });

    expect(result.proposal.policyPatches).toEqual([
      { kind: "set_rest_weekdays", restWeekdays: [0, 6] },
    ]);
    expect(result.proposal.draftCommands).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
