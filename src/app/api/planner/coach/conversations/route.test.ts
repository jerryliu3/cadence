// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  listConversationsResponse: vi.fn(),
  saveConversationRpc: vi.fn(),
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
  };
});

import { GET, POST } from "./route";

describe("planner coach conversations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveConversationRpc.mockResolvedValue({
      data: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          scope_month: "2026-08",
          timezone: "UTC",
          title: "Help me build next week.",
          preview_text: "Let's start with three runs.",
          message_count: 2,
          created_at: "2026-08-06T12:00:00.000Z",
          updated_at: "2026-08-06T12:00:00.000Z",
        },
      ],
      error: null,
    });

    const conversationQuery = {
      select: vi.fn(() => conversationQuery),
      eq: vi.fn(() => conversationQuery),
      order: vi.fn(() => conversationQuery),
      limit: vi.fn(() => conversationQuery),
      then: (
        resolve: (value: Awaited<ReturnType<typeof mocks.listConversationsResponse>>) => unknown
      ) => resolve(mocks.listConversationsResponse()),
    };
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "planner_coach_conversations") {
            return {
              select: vi.fn(() => conversationQuery),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        }),
        rpc: mocks.saveConversationRpc,
      },
      capabilities: {
        calendarEnabled: true,
      },
    });
    mocks.listConversationsResponse.mockReturnValue({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
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
  });

  it("lists saved conversations for the active scope", async () => {
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

  it("returns service unavailable when conversation table wiring is unavailable", async () => {
    mocks.listConversationsResponse.mockReturnValue({
      data: null,
      error: {
        code: "PGRST205",
        message:
          "Could not find the table public.planner_coach_conversations in the schema cache",
        details: null,
        hint: null,
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/planner/coach/conversations?scopeMonth=2026-08&limit=10"
      )
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "conversation_list_unavailable",
      correlationId: expect.any(String),
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

    const response = await POST(
      new Request("http://localhost/api/planner/coach/conversations", {
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.saveConversationRpc).toHaveBeenCalledWith(
      "save_planner_coach_conversation_service",
      expect.objectContaining({
        p_scope_month: "2026-08",
        p_timezone: "UTC",
        p_title: "Help me build next week.",
        p_preview_text: "Let's start with three runs.",
      })
    );
    expect(mocks.saveConversationRpc).toHaveBeenCalledWith(
      "save_planner_coach_conversation_service",
      expect.objectContaining({
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
        previewText: "Let's start with three runs.",
      },
    });
  });

  it("returns conversation_save_failed when atomic save RPC fails", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValue({
      scopeMonth: "2026-08",
      timezone: "UTC",
      messages: [
        {
          role: "user",
          content: "Help me build next week.",
        },
      ],
    });
    mocks.saveConversationRpc.mockResolvedValue({
      error: {
        code: "23514",
        message: "planner_coach_conversation_messages_role",
      },
      data: null,
    });

    const response = await POST(
      new Request("http://localhost/api/planner/coach/conversations", {
        method: "POST",
      })
    );

    expect(response.status).toBe(503);
    expect(mocks.saveConversationRpc).toHaveBeenCalledWith(
      "save_planner_coach_conversation_service",
      expect.objectContaining({
        p_scope_month: "2026-08",
        p_timezone: "UTC",
        p_title: "Help me build next week.",
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      code: "conversation_save_failed",
    });
  });
});
