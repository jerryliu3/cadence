// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { PlannerError } from "@/lib/planner/kernel";

const mocks = vi.hoisted(() => ({
  requirePlannerRouteContext: vi.fn(),
  resolveCanonicalAsOfDate: vi.fn(),
  loadPlannerCanonicalSnapshot: vi.fn(),
  loadPlannerContextPayload: vi.fn(),
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
    requirePlannerRouteContext: mocks.requirePlannerRouteContext,
    resolveCanonicalAsOfDate: mocks.resolveCanonicalAsOfDate,
  };
});

vi.mock("@/lib/planner/context-loader", () => ({
  loadPlannerCanonicalSnapshot: mocks.loadPlannerCanonicalSnapshot,
  loadPlannerContextPayload: mocks.loadPlannerContextPayload,
}));

vi.mock("@/lib/planner/kernel", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/planner/kernel")>(
      "@/lib/planner/kernel"
    );
  return {
    ...actual,
    runPlannerKernel: mocks.runPlannerKernel,
  };
});

import { GET } from "./route";

describe("planner context GET route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {},
      capabilities: {
        crossMonthMovesEnabled: false,
      },
    });
    mocks.resolveCanonicalAsOfDate.mockReturnValue("2026-08-05");
    mocks.loadPlannerCanonicalSnapshot.mockResolvedValue({
      goals: [],
      completions: [],
      links: [],
      revisions: {
        canonicalRevision: 0,
        executionRevision: 0,
      },
      preferences: {
        timezone: "UTC",
        timezone_confirmed_at: "2026-08-01T00:00:00.000Z",
        policy_revision: 1,
        default_policy: createDefaultPlannerPolicy(
          "UTC",
          "2026-08-01T00:00:00.000Z"
        ),
      },
      activePlan: null,
    });
  });

  it("maps planner kernel bounds errors to typed 413 responses", async () => {
    mocks.loadPlannerContextPayload.mockImplementation(() => {
      throw new PlannerError(
        "plan_too_large",
        413,
        "Planner generation input exceeds unit limits."
      );
    });

    const response = await GET(
      new Request("http://localhost/api/planner/context?scopeMonth=2026-08")
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "plan_too_large",
      message: "Planner generation input exceeds unit limits.",
      correlationId: expect.any(String),
    });
    expect(mocks.loadPlannerContextPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeMonth: "2026-08",
      })
    );
  });
});
