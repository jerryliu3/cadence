// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PLANNER_WINDOW_DAYS } from "@/lib/planner/contracts/bounds";

const mocks = vi.hoisted(() => ({
  parseBoundedJsonBody: vi.fn(),
  requirePlannerRouteContext: vi.fn(),
  preparePlannerSchedule: vi.fn(),
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
  };
});

vi.mock("@/lib/planner/prepare", () => ({
  preparePlannerSchedule: mocks.preparePlannerSchedule,
}));

import { POST } from "./route";

describe("planner prepare route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseBoundedJsonBody.mockResolvedValue({
      scopeMonth: "2026-08",
      visibleStart: "2026-07-01",
      visibleEnd: "2026-09-30",
    });
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {},
      capabilities: { crossMonthMovesEnabled: false },
    });
    mocks.preparePlannerSchedule.mockResolvedValue({
      schemaVersion: "1",
      scopeMonth: "2026-08",
      activePlan: null,
      preview: null,
    });
  });

  it("prepares and returns one canonical visible context", async () => {
    const response = await POST(
      new Request("http://localhost/api/planner/prepare", { method: "POST" })
    );

    expect(response.status).toBe(200);
    expect(mocks.preparePlannerSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "11111111-1111-4111-8111-111111111111",
        scopeMonth: "2026-08",
        visibleWindow: {
          start: "2026-07-01",
          end: "2026-09-30",
        },
      })
    );
  });

  it("rejects visible windows whose month-expanded solve span exceeds bounds", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      scopeMonth: "2026-08",
      visibleStart: "2026-01-31",
      visibleEnd: "2027-01-30",
    });

    const response = await POST(
      new Request("http://localhost/api/planner/prepare", { method: "POST" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      message: `Planner window exceeds ${MAX_PLANNER_WINDOW_DAYS} days.`,
    });
    expect(mocks.preparePlannerSchedule).not.toHaveBeenCalled();
  });
});
