// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPlannerPolicy } from "@/lib/planner/policy";
import { PlannerError } from "@/lib/planner/kernel";

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

import { POST } from "./route";

describe("planner save route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlannerRouteContext.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: {},
      capabilities: {
        calendarEnabled: true,
      },
    });
    mocks.parseBoundedJsonBody.mockResolvedValue({
      scopeMonth: "2026-08",
      previewHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expectedDigest:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      confirmationHash: null,
      draftCommands: [],
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

  it("maps planner kernel validation errors to typed 400 responses", async () => {
    mocks.runPlannerKernel.mockImplementation(() => {
      throw new PlannerError(
        "validation_failed",
        400,
        "Planner policy failed validation."
      );
    });

    const response = await POST(
      new Request("http://localhost/api/planner/save", {
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      message: "Planner policy failed validation.",
      correlationId: expect.any(String),
    });
    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveExistingAssignments: true,
      })
    );
  });

  it("recomputes assignments when save includes a policy override", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValueOnce({
      scopeMonth: "2026-08",
      previewHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expectedDigest:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      confirmationHash: null,
      draftCommands: [],
      policy: createDefaultPlannerPolicy("UTC", "2026-08-01T00:00:00.000Z"),
    });
    mocks.runPlannerKernel.mockImplementation(() => {
      throw new PlannerError(
        "validation_failed",
        400,
        "Planner policy failed validation."
      );
    });

    await POST(
      new Request("http://localhost/api/planner/save", {
        method: "POST",
      })
    );

    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveExistingAssignments: false,
      })
    );
  });

  it("returns preview_hash_mismatch when solveIntent does not match the preview hash", async () => {
    mocks.parseBoundedJsonBody.mockResolvedValue({
      scopeMonth: "2026-08",
      previewHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expectedDigest:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      confirmationHash: null,
      draftCommands: [],
      solveIntent: "stable",
    });
    mocks.runPlannerKernel.mockReturnValue({
      generationInputHash:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });

    const response = await POST(
      new Request("http://localhost/api/planner/save", {
        method: "POST",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "preview_hash_mismatch",
      message: "Planner preview hash is stale. Regenerate and publish again.",
      correlationId: expect.any(String),
    });
    expect(mocks.runPlannerKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        solveIntent: "stable",
      })
    );
  });
});
