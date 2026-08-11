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
      options?: { details?: Record<string, unknown> }
    ) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = options?.details;
    }
  }

  return {
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
  return new Request("http://localhost/api/planner/reset-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

describe("planner full reset route", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.parseBoundedJsonBody.mockResolvedValue({
      expectedDigest: "a".repeat(64),
      scopeMonths: ["2026-08", "2026-09"],
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

  it("persists an empty batch for all requested months", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ schedule_digest: "b".repeat(64), upserted_count: 0, scope_count: 2 }],
      error: null,
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      requestedScopeCount: 2,
      scopeCount: 2,
      upsertedCount: 0,
      scheduleDigest: "b".repeat(64),
      correlationId: "corr-id",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("set_planner_schedule_batch", {
      p_batches: [
        { scope_month: "2026-08-01", items: [] },
        { scope_month: "2026-09-01", items: [] },
      ],
      p_expected_digest: "a".repeat(64),
    });
  });

  it("maps stale digest errors to stale_revision", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "stale_schedule" },
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "stale_revision",
    });
  });
});
