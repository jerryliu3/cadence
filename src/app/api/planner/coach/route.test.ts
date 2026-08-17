// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  loadSnapshot: vi.fn(),
  consumeQuota: vi.fn(),
  generateGeminiJson: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/planner/context-loader", () => ({
  loadPlannerCanonicalSnapshot: mocks.loadSnapshot,
}));

vi.mock("@/lib/planner/ai-quota", () => ({
  readPlannerCoachQuotaLimit: () => 20,
  shouldBypassPlannerCoachQuota: () =>
    process.env.CALENDAR_COACH_DISABLE_QUOTA?.trim().toLowerCase() === "true",
  consumePlannerAiQuota: mocks.consumeQuota,
}));

vi.mock("@/lib/ai/gemini", () => ({
  generateGeminiJson: mocks.generateGeminiJson,
  GeminiRequestError: class GeminiRequestError extends Error {
    constructor(
      public code: string,
      public retryable: boolean,
      message: string
    ) {
      super(message);
    }
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/planner/coach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("planner coach route", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.loadSnapshot.mockResolvedValue({
      goals: [
        {
          id: "12000000-0000-4000-8000-000000000001",
          owner_id: "11111111-1111-4111-8111-111111111111",
          title: "Read",
          description: null,
          category: "Personal",
          color: null,
          frequency_type: "recurring",
          recurrence_interval: "daily",
          target_count: 20,
          milestone_names: null,
          start_date: "2026-01-01",
          end_date: "2026-01-31",
          photo_path: null,
          team_id: null,
          is_deleted: false,
          archived_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      completions: [],
      links: [],
      revisions: { canonicalRevision: 1, executionRevision: 1 },
      preferences: {
        owner_id: "11111111-1111-4111-8111-111111111111",
        timezone: "UTC",
        default_policy: {
          schemaVersion: "1",
          timezone: "UTC",
          timezoneConfirmedAt: "2026-01-01T00:00:00.000Z",
          restWeekdays: [],
          blackoutRanges: [],
        },
        policy_schema_version: "1",
        policy_compiler_version: "1",
        policy_revision: 1,
        timezone_confirmed_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      activePlan: null,
    });
    mocks.consumeQuota.mockResolvedValue({
      usageDate: "2026-01-31",
      allowed: true,
      requestCount: 1,
      remaining: 19,
      retryAfterSeconds: 321,
    });
    mocks.generateGeminiJson.mockResolvedValue({
      candidateJson: {
        schemaVersion: "1",
        phase: "review",
        reply: "Try reducing rest days this week.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [1, 3, 5],
              addBlackoutRanges: [],
              removeBlackoutRanges: [],
            },
          },
          unresolvedQuestions: ["Do you have blackout dates this month?"],
        },
        recommendations: [{ text: "Keep daily sessions short." }],
      },
      outputTokens: 123,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
    vi.unstubAllGlobals();
  });

  it("authenticates before parsing the body", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const response = await POST(request(null));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
    });
  });

  it("returns quota guidance when exhausted", async () => {
    mocks.consumeQuota.mockResolvedValue({
      usageDate: "2026-01-31",
      allowed: false,
      requestCount: 20,
      remaining: 0,
      retryAfterSeconds: 123,
    });
    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Help me plan this month." }],
      })
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("123");
    await expect(response.json()).resolves.toMatchObject({
      code: "quota_exceeded",
    });
  });

  it("sanitizes coach output into executable proposals", async () => {
    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Help me plan this month." }],
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.generateGeminiJson).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("PROMPT-INJECTION RESISTANCE"),
      })
    );
    expect(mocks.generateGeminiJson).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "highly experienced professional life coach"
        ),
      })
    );
    expect(mocks.generateGeminiJson).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 8_192,
        totalTimeoutMs: 45_000,
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      phase: "review",
      proposal: {
        assessments: [],
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [1, 3, 5],
          },
        ],
      },
      warnings: [],
    });
  });

  it("honors timeout env override for coach generation", async () => {
    vi.stubEnv("CALENDAR_COACH_TIMEOUT_MS", "55000");
    resetEnvCacheForTests();
    mocks.generateGeminiJson.mockClear();

    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Help me plan this month." }],
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.generateGeminiJson).toHaveBeenCalledWith(
      expect.objectContaining({
        totalTimeoutMs: 55_000,
        maxOutputTokens: 8_192,
      })
    );
  });

  it("bypasses quota RPC when local quota disable flag is enabled", async () => {
    vi.stubEnv("CALENDAR_COACH_DISABLE_QUOTA", "true");
    resetEnvCacheForTests();
    mocks.consumeQuota.mockClear();

    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Help me plan this month." }],
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      quota: {
        usageDate: expect.any(String),
        remaining: 999999,
      },
    });
  });

  it("maps malformed envelope output to ai_invalid_output", async () => {
    mocks.generateGeminiJson.mockResolvedValue({
      candidateJson: {
        schemaVersion: "1",
        phase: "review",
        proposal: {},
      },
      outputTokens: 12,
      attempts: 1,
    });

    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Help me plan this month." }],
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "ai_invalid_output",
    });
  });

  it("compiles explicit calendar intent into supported global policy patches", async () => {
    mocks.generateGeminiJson.mockResolvedValue({
      candidateJson: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Applying rest weekdays and blackout windows.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [2, 4, 6],
              addBlackoutRanges: [{ start: "2026-01-18", end: "2026-01-18" }],
              removeBlackoutRanges: [{ start: "2026-01-20", end: "2026-01-20" }],
            },
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Keep recovery days between runs." }],
      },
      outputTokens: 44,
      attempts: 1,
    });

    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Make this apply-able." }],
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proposal: {
        assessments: [],
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [2, 4, 6],
          },
          {
            kind: "add_blackout_range",
            start: "2026-01-18",
            end: "2026-01-18",
          },
          {
            kind: "remove_blackout_range",
            start: "2026-01-20",
            end: "2026-01-20",
          },
        ],
      },
      warnings: [],
    });
  });

  it("accepts apply payloads when global omits blackout arrays", async () => {
    mocks.generateGeminiJson.mockResolvedValue({
      candidateJson: {
        schemaVersion: "1",
        phase: "ready",
        reply: "I set weekend rest days.",
        proposal: {
          calendarIntent: {
            action: "apply",
            global: {
              restWeekdays: [0, 6],
            },
          },
        },
        recommendations: ["Keep weekdays realistic."],
      },
      outputTokens: 28,
      attempts: 1,
    });

    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Make weekends rest days." }],
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proposal: {
        policyPatches: [
          {
            kind: "set_rest_weekdays",
            restWeekdays: [0, 6],
          },
        ],
      },
      recommendations: [{ text: "Keep weekdays realistic." }],
      warnings: [],
    });
  });

  it("resolves sessionRef moves against the server session roster", async () => {
    mocks.loadSnapshot.mockResolvedValue({
      goals: [
        {
          id: "12000000-0000-4000-8000-000000000001",
          owner_id: "11111111-1111-4111-8111-111111111111",
          title: "Read",
          description: null,
          category: "Personal",
          color: null,
          frequency_type: "recurring",
          recurrence_interval: "daily",
          target_count: 20,
          milestone_names: null,
          start_date: "2026-01-01",
          end_date: "2026-01-31",
          photo_path: null,
          team_id: null,
          is_deleted: false,
          archived_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      completions: [],
      links: [],
      revisions: { canonicalRevision: 1, executionRevision: 1 },
      preferences: {
        owner_id: "11111111-1111-4111-8111-111111111111",
        timezone: "UTC",
        default_policy: {
          schemaVersion: "1",
          timezone: "UTC",
          timezoneConfirmedAt: "2026-01-01T00:00:00.000Z",
          restWeekdays: [],
          blackoutRanges: [],
        },
        policy_schema_version: "1",
        policy_compiler_version: "1",
        policy_revision: 1,
        timezone_confirmed_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      activePlan: {
        items: [
          {
            plan_goal_id: "12000000-0000-4000-8000-000000000001",
            unit_key: "total:1",
            scheduled_date: "2026-01-16",
          },
        ],
      },
    });
    mocks.generateGeminiJson.mockResolvedValue({
      candidateJson: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Moved that session.",
        proposal: {
          calendarIntent: {
            action: "apply",
            sessionMoves: [
              {
                sessionRef: "s1",
                scheduledDate: "2026-01-20",
              },
            ],
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Keep spacing consistent." }],
      },
      outputTokens: 44,
      attempts: 1,
    });

    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Move that session to next week." }],
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.generateGeminiJson).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Session roster JSON"),
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      proposal: {
        policyPatches: [
          {
            kind: "move_session",
            goalId: "12000000-0000-4000-8000-000000000001",
            unitKey: "total:1",
            scheduledDate: "2026-01-20",
          },
        ],
      },
      warnings: [],
    });
  });

  it("refuses to compile edits when the activity needs a matching goal", async () => {
    mocks.generateGeminiJson.mockResolvedValue({
      candidateJson: {
        schemaVersion: "1",
        phase: "ready",
        reply: "Create a running goal before applying this schedule.",
        proposal: {
          calendarIntent: {
            action: "needs_goal",
            global: null,
          },
          unresolvedQuestions: [],
        },
        recommendations: [{ text: "Add a running goal first." }],
      },
      outputTokens: 20,
      attempts: 1,
    });

    const response = await POST(
      request({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Apply this as concrete edits." }],
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proposal: {
        policyPatches: [],
      },
      warnings: [
        "No calendar edits were generated because this plan does not map to an existing goal.",
      ],
    });
  });
});
