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
  return new Request("http://localhost/api/planner/items/manual/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

describe("planner manual item delete route", () => {
  beforeEach(() => {
    mocks.parseBoundedJsonBody.mockReset();
    mocks.requirePlannerRouteContext.mockReset();
    mocks.rpc.mockReset();

    mocks.parseBoundedJsonBody.mockResolvedValue({
      itemId: "33000000-0000-4000-8000-000000000001",
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

  it("returns deleted planner item and digest", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          item_id: "33000000-0000-4000-8000-000000000001",
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
      scheduleDigest: "b".repeat(64),
      correlationId: "corr-id",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_planner_manual_item", {
      p_item_id: "33000000-0000-4000-8000-000000000001",
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

  it("maps missing planner item ids to planner_item_not_found", async () => {
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
