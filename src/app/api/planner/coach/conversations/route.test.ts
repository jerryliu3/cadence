// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  callAdminRpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

vi.mock("@/lib/planner/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/planner/api")>(
      "@/lib/planner/api"
    );
  return {
    ...actual,
    createCorrelationId: () => "test-correlation-id",
    parseBoundedJsonBody: mocks.parseBoundedJsonBody,
    requirePlannerRouteContext: mocks.requirePlannerRouteContext,
    requirePlannerAdminClient: () => ({}),
  };
});

vi.mock("@/lib/supabase/admin-rpc", () => ({
  callAdminRpc: mocks.callAdminRpc,
}));

import { GET, POST } from "./route";

describe("planner coach conversations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {},
      capabilities: {
        calendarEnabled: true,
        plannerRead: true,
        plannerGeneration: true,
        plannerPlanWrites: true,
        targetedExactCompletion: true,
        coachAi: true,
        overlap: false,
      },
    });
  });

  it("lists saved conversations for the active scope", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: [
        {
          conversation_id: "22222222-2222-4222-8222-222222222222",
          scope_month: "2026-08",
          timezone: "UTC",
          title: "Weekly running plan",
          preview_text: "Help me set up 4 runs this week.",
          message_count: 4,
          created_at: "2026-08-06T12:00:00.000Z",
          updated_at: "2026-08-06T12:10:00.000Z",
        },
      ],
      error: null,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/planner/coach/conversations?scopeMonth=2026-08&limit=10"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      conversations: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          scopeMonth: "2026-08",
          title: "Weekly running plan",
          messageCount: 4,
        },
      ],
    });
  });

  it("falls back to an empty list when conversation RPC wiring is unavailable", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.list_planner_coach_conversations_service in the schema cache",
        details: null,
        hint: null,
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/planner/coach/conversations?scopeMonth=2026-08&limit=10"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      conversations: [],
      correlationId: "test-correlation-id",
    });
  });

  it("saves coach conversations with message history", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValue({
      scopeMonth: "2026-08",
      timezone: "UTC",
      messages: [
        {
          role: "user",
          content: "Help me build next week.",
        },
        {
          role: "assistant",
          content: "Let's start with three runs.",
          proposal: {
            schemaVersion: "1",
            applyStatus: "not_applied",
            patchSignature:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            baselineSnapshotToken:
              "policy:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            baselinePolicy: {
              schemaVersion: "1",
              timezone: "UTC",
              timezoneConfirmedAt: "2026-08-01T00:00:00.000Z",
              restWeekdays: [],
              blackoutRanges: [],
            },
            policyPatches: [
              {
                kind: "set_rest_weekdays",
                restWeekdays: [2, 4],
              },
            ],
            unresolvedQuestions: [],
          },
        },
      ],
    });
    mocks.callAdminRpc.mockResolvedValue({
      data: [
        {
          conversation_id: "33333333-3333-4333-8333-333333333333",
          scope_month: "2026-08",
          timezone: "UTC",
          title: "Help me build next week.",
          preview_text: "Help me build next week.",
          message_count: 2,
          created_at: "2026-08-06T12:00:00.000Z",
          updated_at: "2026-08-06T12:00:00.000Z",
        },
      ],
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/planner/coach/conversations", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.callAdminRpc).toHaveBeenCalledWith(
      expect.anything(),
      "save_planner_coach_conversation_service",
      expect.objectContaining({
        p_scope_month: "2026-08",
        p_timezone: "UTC",
        p_messages: [
          {
            role: "user",
            content: "Help me build next week.",
            proposal: null,
          },
          {
            role: "assistant",
            content: "Let's start with three runs.",
            proposal: expect.objectContaining({
              applyStatus: "not_applied",
              policyPatches: expect.arrayContaining([
                expect.objectContaining({
                  kind: "set_rest_weekdays",
                }),
              ]),
            }),
          },
        ],
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      conversation: {
        id: "33333333-3333-4333-8333-333333333333",
        messageCount: 2,
      },
    });
  });
});
