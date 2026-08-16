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
  return new Request("http://localhost/api/training-plan/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

describe("training plan import route", () => {
  beforeEach(() => {
    mocks.parseBoundedJsonBody.mockReset();
    mocks.requirePlannerRouteContext.mockReset();
    mocks.rpc.mockReset();

    mocks.parseBoundedJsonBody.mockResolvedValue({
      goals: [
        {
          title: "Easy run",
          frequency_type: "recurring",
          recurrence_interval: "weekly",
          start_date: "2026-09-01",
          end_date: "2026-09-30",
          sessions: [{ scheduled_date: "2026-09-02", scheduled_time: "07:00" }],
        },
      ],
    });
    mocks.requirePlannerRouteContext.mockResolvedValue({
      supabase: {
        rpc: mocks.rpc,
      },
    });
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_planner_schedule_digest") {
        return Promise.resolve({
          data: "d".repeat(64),
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: null,
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns imported goal/session counts and schedule digest", async () => {
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_planner_schedule_digest") {
        return Promise.resolve({
          data: "d".repeat(64),
          error: null,
        });
      }
      return Promise.resolve({
        data: [
          {
            goal_count: 2,
            session_count: 14,
            schedule_digest: "a".repeat(64),
          },
        ],
        error: null,
      });
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      goalCount: 2,
      sessionCount: 14,
      scheduleDigest: "a".repeat(64),
      correlationId: "corr-id",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "get_planner_schedule_digest", {});
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "import_training_plan", {
      p_goals: [
        {
          title: "Easy run",
          frequency_type: "recurring",
          recurrence_interval: "weekly",
          start_date: "2026-09-01",
          end_date: "2026-09-30",
          sessions: [{ scheduled_date: "2026-09-02", scheduled_time: "07:00" }],
        },
      ],
      p_expected_digest: "d".repeat(64),
    });
  });

  it("maps schedule conflicts to 409", async () => {
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_planner_schedule_digest") {
        return Promise.resolve({
          data: "d".repeat(64),
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: { code: "P0001", message: "schedule_conflict" },
      });
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "schedule_conflict",
      correlationId: "corr-id",
    });
  });

  it("maps payload validation failures to 400", async () => {
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_planner_schedule_digest") {
        return Promise.resolve({
          data: "d".repeat(64),
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: { code: "22023", message: "invalid_training_plan_payload" },
      });
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      correlationId: "corr-id",
    });
  });

  it("maps database constraint validation failures to 400", async () => {
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_planner_schedule_digest") {
        return Promise.resolve({
          data: "d".repeat(64),
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: { code: "23514", message: "check constraint failed" },
      });
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      correlationId: "corr-id",
    });
  });

  it("maps stale schedule conflicts to 409", async () => {
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_planner_schedule_digest") {
        return Promise.resolve({
          data: "d".repeat(64),
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        error: { code: "P0001", message: "stale_schedule" },
      });
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "stale_schedule",
      correlationId: "corr-id",
    });
  });
});
