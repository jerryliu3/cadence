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
  return new Request("http://localhost/api/planner/items/instance-adjust", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

describe("planner instance adjust route", () => {
  beforeEach(() => {
    mocks.parseBoundedJsonBody.mockReset();
    mocks.requirePlannerRouteContext.mockReset();
    mocks.rpc.mockReset();

    mocks.parseBoundedJsonBody.mockResolvedValue({
      goalId: "22000000-0000-4000-8000-000000000001",
      action: "add",
      date: "2026-08-22",
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

  it("returns updated target count and digest", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          goal_id: "22000000-0000-4000-8000-000000000001",
          unit_key: "total:6",
          target_count: 6,
          schedule_digest: "b".repeat(64),
        },
      ],
      error: null,
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      goalId: "22000000-0000-4000-8000-000000000001",
      unitKey: "total:6",
      targetCount: 6,
      scheduleDigest: "b".repeat(64),
      correlationId: "corr-id",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("adjust_targeted_planner_instance", {
      p_goal_id: "22000000-0000-4000-8000-000000000001",
      p_action: "add",
      p_scheduled_date: "2026-08-22",
      p_unit_key: null,
      p_expected_digest: "a".repeat(64),
    });
  });

  it("maps stale schedule writes to stale_revision", async () => {
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

  it("maps unsupported requirement kind to validation_failed", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "unsupported_requirement_kind" },
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      correlationId: "corr-id",
    });
  });

  it("maps missing planner items to planner_item_not_found", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValue({
      goalId: "22000000-0000-4000-8000-000000000001",
      action: "delete",
      unitKey: "total:2",
      expectedDigest: "a".repeat(64),
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "planner_item_not_found" },
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "planner_item_not_found",
      correlationId: "corr-id",
    });
  });
});
