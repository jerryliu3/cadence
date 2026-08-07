// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
    requirePlannerRouteContext: mocks.requirePlannerRouteContext,
    requirePlannerAdminClient: () => ({}),
  };
});

vi.mock("@/lib/supabase/admin-rpc", () => ({
  callAdminRpc: mocks.callAdminRpc,
}));

import { GET } from "./route";

describe("planner coach conversation restore route", () => {
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

  it("restores saved conversation messages", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: [
        {
          conversation_id: "33333333-3333-4333-8333-333333333333",
          scope_month: "2026-08",
          timezone: "UTC",
          title: "Weekly running plan",
          preview_text: "Help me build next week.",
          message_count: 2,
          created_at: "2026-08-06T12:00:00.000Z",
          updated_at: "2026-08-06T12:00:00.000Z",
          message_ordinal: 1,
          message_role: "user",
          message_content: "Help me build next week.",
          message_created_at: "2026-08-06T12:00:00.000Z",
          message_proposal_meta: null,
        },
        {
          conversation_id: "33333333-3333-4333-8333-333333333333",
          scope_month: "2026-08",
          timezone: "UTC",
          title: "Weekly running plan",
          preview_text: "Help me build next week.",
          message_count: 2,
          created_at: "2026-08-06T12:00:00.000Z",
          updated_at: "2026-08-06T12:00:00.000Z",
          message_ordinal: 2,
          message_role: "assistant",
          message_content: "Let's start with three runs.",
          message_created_at: "2026-08-06T12:00:30.000Z",
          message_proposal_meta: {
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
              goalAllowedWeekdays: {},
              datePreferences: [],
              spacingStrategy: "even",
              goalSpacingStrategies: {},
              dailyCadenceRestExemption: true,
            },
            policyPatches: [
              {
                kind: "set_spacing_strategy",
                spacingStrategy: "even",
              },
            ],
            unresolvedQuestions: [],
          },
        },
      ],
      error: null,
    });

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
                kind: "set_spacing_strategy",
              }),
            ]),
          }),
        },
      ],
    });
  });

  it("returns not found when no conversation rows exist", async () => {
    mocks.callAdminRpc.mockResolvedValue({
      data: [],
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
