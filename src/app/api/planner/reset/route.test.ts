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
    createCorrelationId: () => "corr-id",
    parseBoundedJsonBody: mocks.parseBoundedJsonBody,
    plannerErrorResponse: (error: PlannerRouteError, correlationId: string) =>
      NextResponse.json(
        { code: error.code, message: error.message, correlationId },
        { status: error.status }
      ),
    PlannerRouteError,
    requirePlannerRouteContext: mocks.requirePlannerRouteContext,
    unknownPlannerErrorResponse: (correlationId: string) =>
      NextResponse.json({ code: "internal_error", correlationId }, { status: 500 }),
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
  return new Request("http://localhost/api/planner/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

describe("planner reset route", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.parseBoundedJsonBody.mockResolvedValue({
      scopeMonth: "2026-08",
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

  it("returns unlocked count and updated digest on reset", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ unlocked_count: 3, schedule_digest: "b".repeat(64) }],
      error: null,
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      scopeMonth: "2026-08",
      unlockedCount: 3,
      scheduleDigest: "b".repeat(64),
      correlationId: "corr-id",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("clear_planner_schedule", {
      p_month: "2026-08-01",
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
