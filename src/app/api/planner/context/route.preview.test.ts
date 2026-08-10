// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";

const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  resolveCanonicalAsOfDate: vi.fn(),
  loadPlannerCanonicalSnapshot: vi.fn(),
  runPlannerKernel: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: vi.fn() } }),
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
    resolveCanonicalAsOfDate: mocks.resolveCanonicalAsOfDate,
  };
});

vi.mock("@/lib/planner/context-loader", () => ({
  loadPlannerCanonicalSnapshot: mocks.loadPlannerCanonicalSnapshot,
}));

vi.mock("@/lib/planner/kernel", () => ({
  PlannerError: class PlannerError extends Error {
    code: string;
    httpStatus: number;
    details?: Record<string, unknown>;

    constructor(
      code: string,
      httpStatus: number,
      message: string,
      details?: Record<string, unknown>
    ) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
      this.details = details;
    }
  },
  runPlannerKernel: mocks.runPlannerKernel,
}));

import { POST } from "./route";

describe("planner context preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {},
      capabilities: {
        calendarEnabled: true,
      },
    });
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-05");
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValue({
      preferences: {
        timezone: "UTC",
        default_policy: {
          schemaVersion: "v1",
          timezone: "UTC",
        },
      },
    });
  });

  it("returns typed 400 when request policy fails schema validation", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValue({
      scopeMonth: "2026-08",
      source: "manual",
      timezone: "UTC",
      policy: {
        timezone: "UTC",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/planner/context", {
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      message: "Planner policy failed validation.",
      correlationId: expect.any(String),
      details: {
        stage: "request_policy",
      },
    });
    expect(mocks.runPlannerKernel).not.toHaveBeenCalled();
  });

  it("uses fresh recomputation for explicit preview generation", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      scopeMonth: "2026-08",
      source: "manual",
      timezone: "UTC",
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
    });
    mocks.runPlannerKernel.mockImplementationOnce(() => {
      throw new Error("forced");
    });

    const response = await POST(
      new Request("http://localhost/api/planner/context", {
        method: "POST",
      })
    );

    expect(response.status).toBe(500);
    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveExistingAssignments: false,
        solveIntent: "stable",
      })
    );
  });

  it("forwards draft move commands as solver pin map during preview generation", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      scopeMonth: "2026-08",
      source: "update",
      timezone: "UTC",
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
      draftCommands: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          sequence: 1,
          kind: "move_item",
          goalId: "12000000-0000-4000-8000-000000000001",
          unitKey: "total:1",
          scheduledDate: "2026-08-10",
        },
      ],
    });
    mocks.runPlannerKernel.mockImplementationOnce(() => {
      throw new Error("forced");
    });

    const response = await POST(
      new Request("http://localhost/api/planner/context", {
        method: "POST",
      })
    );

    expect(response.status).toBe(500);
    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        solveIntent: "stable",
        draftPinnedDates: {
          "12000000-0000-4000-8000-000000000001:total:1": "2026-08-10",
        },
      })
    );
  });

  it("returns validation_failed when pinned moves are not honored by preview solve", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      scopeMonth: "2026-08",
      source: "update",
      timezone: "UTC",
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
      draftCommands: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          sequence: 1,
          kind: "move_item",
          goalId: "12000000-0000-4000-8000-000000000001",
          unitKey: "total:1",
          scheduledDate: "2026-08-10",
        },
      ],
    });
    mocks.runPlannerKernel.mockReturnValueOnce({
      workUnits: [],
    });

    const response = await POST(
      new Request("http://localhost/api/planner/context", {
        method: "POST",
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      details: {
        stage: "draft_pins",
        code: "draft_pin_unhonored",
      },
    });
  });
});
