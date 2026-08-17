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
    team_id: null,
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

  it("returns an actionable draft prompt without the needs-goal warning", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "I drafted a four-week running foundation.",
        proposal: {
          calendarIntent: {
            action: "needs_goal",
            goalDraftPrompt:
              "Easy run weekly from 2026-08-17 to 2026-09-13, total target 4.",
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Keep the effort conversational." }],
      },
    });

    expect(result.proposal).toMatchObject({
      policyPatches: [],
      goalDraftPrompt:
        "Easy run weekly from 2026-08-17 to 2026-09-13, total target 4.",
    });
    expect(result.warnings).toEqual([]);
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

  it("accepts partial global payloads with defaulted blackout arrays", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Applied weekend rest days.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [0, 6],
            },
          },
        },
      },
    });

    expect(result.proposal.policyPatches).toEqual([
      { kind: "set_rest_weekdays", restWeekdays: [0, 6] },
    ]);
    expect(result.proposal.unresolvedQuestions).toEqual([]);
  });

  it("normalizes string recommendations into recommendation objects", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      raw: {
        schemaVersion: "1",
        phase: "review",
        reply: "Try spacing effort across weekdays.",
        proposal: {
          calendarIntent: {
            action: "none",
            global: null,
          },
        },
        recommendations: ["Keep Tuesday light."],
      },
    });

    expect(result.recommendations).toEqual([{ text: "Keep Tuesday light." }]);
  });

  it("compiles known-goal session moves into move_session patches", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      sessionRoster: [
        {
          sessionRef: "s1",
          goalId: goalA.id,
          unitKey: "total:1",
          scheduledDate: "2026-09-08",
          goalTitle: goalA.title,
        },
      ],
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Moved that long run to Saturday.",
        proposal: {
          calendarIntent: {
            action: "apply",
            sessionMoves: [
              {
                goalId: goalA.id,
                unitKey: "total:1",
                scheduledDate: "2026-09-12",
              },
              {
                goalId: "99999999-9999-4999-8999-999999999999",
                unitKey: "total:2",
                scheduledDate: "2026-09-13",
              },
            ],
          },
        },
      },
    });

    expect(result.proposal.policyPatches).toEqual([
      {
        kind: "move_session",
        goalId: goalA.id,
        unitKey: "total:1",
        scheduledDate: "2026-09-12",
      },
    ]);
    expect(result.warnings).toContain(
      "Ignored session move for unknown goal 99999999-9999-4999-8999-999999999999."
    );
  });

  it("resolves sessionRef moves using the server-provided session roster", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      sessionRoster: [
        {
          sessionRef: "s1",
          goalId: goalA.id,
          unitKey: "total:5",
          scheduledDate: "2026-09-10",
          goalTitle: goalA.title,
        },
      ],
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Moved that session.",
        proposal: {
          calendarIntent: {
            action: "apply",
            sessionMoves: [
              {
                sessionRef: "s1",
                scheduledDate: "2026-09-12",
              },
            ],
          },
        },
      },
    });

    expect(result.proposal.policyPatches).toEqual([
      {
        kind: "move_session",
        goalId: goalA.id,
        unitKey: "total:5",
        scheduledDate: "2026-09-12",
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("falls back to the single scheduled session for a goalRef move", () => {
    const goalA = goal({ title: "Create an ice cream that is at least 8.5/10" });
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      sessionRoster: [
        {
          sessionRef: "s7",
          goalId: goalA.id,
          unitKey: "milestone:1",
          scheduledDate: "2026-08-19",
          goalTitle: goalA.title,
        },
      ],
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "I moved your ice cream session.",
        proposal: {
          calendarIntent: {
            action: "apply",
            sessionMoves: [
              {
                goalRef: "ice cream",
                scheduledDate: "2026-08-26",
              },
            ],
          },
          unresolvedQuestions: [],
        },
      },
    });

    expect(result.proposal.policyPatches).toEqual([
      {
        kind: "move_session",
        goalId: goalA.id,
        unitKey: "milestone:1",
        scheduledDate: "2026-08-26",
      },
    ]);
    expect(result.proposal.unresolvedQuestions).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("reports unresolved session references with descriptive warnings", () => {
    const goalA = goal({ title: "Ice cream recipe" });
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      sessionRoster: [
        {
          sessionRef: "s1",
          goalId: goalA.id,
          unitKey: "milestone:1",
          scheduledDate: "2026-08-19",
          goalTitle: goalA.title,
        },
        {
          sessionRef: "s2",
          goalId: goalA.id,
          unitKey: "milestone:2",
          scheduledDate: "2026-08-22",
          goalTitle: goalA.title,
        },
      ],
      raw: {
        schemaVersion: "1",
        phase: "review",
        reply: "I need one clarification.",
        proposal: {
          calendarIntent: {
            action: "apply",
            sessionMoves: [
              {
                goalRef: "ice cream recipe",
                scheduledDate: "2026-08-26",
              },
            ],
          },
          unresolvedQuestions: [],
        },
      },
    });

    expect(result.proposal.policyPatches).toEqual([]);
    expect(result.proposal.unresolvedQuestions).toContain(
      "Which existing Ice cream recipe session should move to 2026-08-26?"
    );
    expect(result.warnings).toContain(
      "Ignored session move because no scheduled Ice cream recipe session matched the provided reference."
    );
  });

  it("falls back to goalRef when goalId is unknown", () => {
    const goalA = goal({ title: "Conference proposal" });
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      sessionRoster: [
        {
          sessionRef: "s9",
          goalId: goalA.id,
          unitKey: "total:3",
          scheduledDate: "2026-08-18",
          goalTitle: goalA.title,
        },
      ],
      raw: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Moved your proposal work block.",
        proposal: {
          calendarIntent: {
            action: "apply",
            sessionMoves: [
              {
                goalId: "99999999-9999-4999-8999-999999999999",
                goalRef: "conference proposal",
                scheduledDate: "2026-08-20",
              },
            ],
          },
        },
      },
    });

    expect(result.proposal.policyPatches).toEqual([
      {
        kind: "move_session",
        goalId: goalA.id,
        unitKey: "total:3",
        scheduledDate: "2026-08-20",
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("warns clearly when a provided sessionRef is missing from roster", () => {
    const goalA = goal();
    const result = sanitizeCoachTurn({
      goalsById: new Map([[goalA.id, goalA]]),
      sessionRoster: [],
      raw: {
        schemaVersion: "1",
        phase: "review",
        reply: "I need one clarification.",
        proposal: {
          calendarIntent: {
            action: "apply",
            sessionMoves: [
              {
                sessionRef: "s404",
                scheduledDate: "2026-09-01",
              },
            ],
          },
          unresolvedQuestions: [],
        },
      },
    });

    expect(result.proposal.policyPatches).toEqual([]);
    expect(result.warnings).toContain(
      'Ignored session move because sessionRef "s404" is not available in the current calendar window.'
    );
    expect(result.proposal.unresolvedQuestions).toContain(
      "Which listed session should move to 2026-09-01?"
    );
  });
});
