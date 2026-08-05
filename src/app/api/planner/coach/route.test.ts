// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  loadSnapshot: vi.fn(),
  consumeQuota: vi.fn(),
  recordTokens: vi.fn(),
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
  consumePlannerAiQuota: mocks.consumeQuota,
  recordPlannerAiOutputTokens: mocks.recordTokens,
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
    vi.stubEnv("CALENDAR_ENABLED", "true");
    vi.stubEnv("CALENDAR_COACH_AI_ENABLED", "true");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
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
          is_group: false,
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
          goalAllowedWeekdays: {},
          datePreferences: [],
          spacingStrategy: "even",
          goalSpacingStrategies: {},
          dailyCadenceRestExemption: true,
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
    mocks.recordTokens.mockResolvedValue(undefined);
    mocks.generateGeminiJson.mockResolvedValue({
      candidateJson: {
        schemaVersion: "1",
        phase: "review",
        reply: "Try reducing rest days this week.",
        proposal: {
          assessments: [
            {
              goalId: "12000000-0000-4000-8000-000000000001",
              estimatedMinutesPerSession: 40,
              difficulty: 4,
              priority: 5,
            },
          ],
          policyPatches: [
            { kind: "set_spacing_strategy", spacingStrategy: "even" },
            { kind: "unsupported_patch_kind" },
          ],
          unresolvedQuestions: ["Do you have blackout dates this month?"],
        },
        recommendations: [{ text: "Keep daily sessions short." }],
      },
      outputTokens: 123,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
        scopeMonth: "2026-01",
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
        scopeMonth: "2026-01",
        focusGoalIds: ["12000000-0000-4000-8000-000000000001"],
        messages: [{ role: "user", content: "Help me plan this month." }],
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      phase: "review",
      proposal: {
        assessments: [
          {
            goalId: "12000000-0000-4000-8000-000000000001",
            source: "ai",
          },
        ],
        policyPatches: [{ kind: "set_spacing_strategy" }],
      },
      warnings: [expect.stringContaining("unsupported policy patch")],
    });
  });
});
