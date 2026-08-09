// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlannerRouteContext: vi.fn(),
  conversationMaybeSingle: vi.fn(),
  messageOrder: vi.fn(),
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
    requirePlannerRouteContext: mocks.requirePlannerRouteContext,
  };
});

import { GET } from "./route";

describe("planner coach conversation restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "planner_coach_conversations") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: mocks.conversationMaybeSingle,
                  }),
                }),
              }),
            };
          }
          if (table === "planner_coach_conversation_messages") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    order: mocks.messageOrder,
                  }),
                }),
              }),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        }),
      },
      capabilities: {
        calendarEnabled: true,
      },
    });
    mocks.conversationMaybeSingle.mockResolvedValue({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        scope_month: "2026-08",
        timezone: "UTC",
        title: "Weekly running plan",
        preview_text: "Help me build next week.",
        message_count: 2,
        created_at: "2026-08-06T12:00:00.000Z",
        updated_at: "2026-08-06T12:00:00.000Z",
      },
      error: null,
    });
    mocks.messageOrder.mockResolvedValue({
      data: [
        {
          ordinal: 1,
          role: "user",
          content: "Help me build next week.",
          created_at: "2026-08-06T12:00:00.000Z",
          proposal_meta: null,
        },
        {
          ordinal: 2,
          role: "assistant",
          content: "Let's start with three runs.",
          created_at: "2026-08-06T12:00:30.000Z",
          proposal_meta: {
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
      error: null,
    });
  });

  it("restores saved conversation messages", async () => {
    const response = await GET(
      new Request("http://localhost/api/planner/coach/conversations/restore"),
      {
        params: Promise.resolve({
          conversationId: "33333333-3333-4333-8333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      conversation: {
        id: "33333333-3333-4333-8333-333333333333",
      },
      messages: [
        { role: "user", content: "Help me build next week." },
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
    });
  });

  it("returns not found when no conversation rows exist", async () => {
    mocks.conversationMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await GET(
      new Request("http://localhost/api/planner/coach/conversations/missing"),
      {
        params: Promise.resolve({
          conversationId: "44444444-4444-4444-8444-444444444444",
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "conversation_not_found",
    });
  });
});
