// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

vi.mock("@/lib/planner/api", async () => {
  const { NextResponse } = await import("next/server");
  class PlannerRouteError extends Error {
    status: number;
    code: string;
    details?: Record<string, unknown>;

    constructor(
      status: number,
      code: string,
      message: string,
      details?: Record<string, unknown>
    ) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  return {
    MAX_API_BODY_BYTES: 64 * 1024,
    parseBoundedJsonBody: mocks.parseBoundedJsonBody,
    PlannerRouteError,
    requirePlannerRouteContext: mocks.requirePlannerRouteContext,
    withPlannerRoute: async (
      handler: (context: { correlationId: string }) => Promise<Response>
    ) => {
      const correlationId = "corr-id";
      try {
        return await handler({ correlationId });
      } catch (error) {
        if (error instanceof PlannerRouteError) {
          return NextResponse.json(
            { code: error.code, message: error.message, correlationId },
            { status: error.status }
          );
        }
        return NextResponse.json(
          { code: "internal_error", correlationId },
          { status: 500 }
        );
      }
    },
  };
});

import { POST } from "./route";

function createRequest() {
  return new Request("http://localhost/api/planner/items/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

describe("planner manual item create route", () => {
  beforeEach(() => {
    mocks.parseBoundedJsonBody.mockReset();
    mocks.requirePlannerRouteContext.mockReset();
    mocks.rpc.mockReset();

    mocks.parseBoundedJsonBody.mockResolvedValue({
      goalId: "22000000-0000-4000-8000-000000000001",
      scheduledDate: "2026-08-20",
      scheduledTime: "07:30",
      expectedDigest: "a".repeat(64),
    });
    mocks.requirePlannerRouteContext.mockResolvedValue({
      supabase: {
        rpc: mocks.rpc,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns created planner item and digest", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          item_id: "33000000-0000-4000-8000-000000000001",
          unit_key: "manual:33000000-0000-4000-8000-000000000001",
          scheduled_date: "2026-08-20",
          locked: true,
          schedule_digest: "b".repeat(64),
        },
      ],
      error: null,
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      itemId: "33000000-0000-4000-8000-000000000001",
      unitKey: "manual:33000000-0000-4000-8000-000000000001",
      scheduledDate: "2026-08-20",
      locked: true,
      scheduleDigest: "b".repeat(64),
      correlationId: "corr-id",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("create_planner_manual_item", {
      p_goal_id: "22000000-0000-4000-8000-000000000001",
      p_scheduled_date: "2026-08-20",
      p_scheduled_time: "07:30",
      p_expected_digest: "a".repeat(64),
    });
  });

  it("maps stale digest writes to stale_revision", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "stale_schedule" },
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "stale_revision",
      correlationId: "corr-id",
    });
  });

  it("maps unknown goal to planner_goal_not_found", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "unknown_goal" },
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "planner_goal_not_found",
      correlationId: "corr-id",
    });
  });
});
