// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/planner/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/planner/api")>(
      "@/lib/planner/api"
    );
  return {
    ...actual,
    createCorrelationId: () => "test-correlation-id",
  };
});

import { GET } from "./route";

describe("planner visible context route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns typed 400 when visible window dates are invalid", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/planner/context/visible?scopeMonth=2026-08&startDate=2026-09-01&endDate=2026-08-01",
        { method: "GET" }
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      message: "Visible window start date must be on or before end date.",
      correlationId: "test-correlation-id",
    });
  });

  it("loads only non-scope months in the visible range", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("scopeMonth=2026-07")) {
        return Response.json({
          schemaVersion: "1",
          scopeMonth: "2026-07",
          goalTitles: { "goal-july": "July Goal" },
          activePlan: null,
          preview: null,
        });
      }
      if (url.includes("scopeMonth=2026-09")) {
        return Response.json({
          schemaVersion: "1",
          scopeMonth: "2026-09",
          goalTitles: { "goal-sept": "September Goal" },
          activePlan: null,
          preview: null,
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "http://localhost/api/planner/context/visible?scopeMonth=2026-08&startDate=2026-07-27&endDate=2026-09-06",
        { method: "GET" }
      )
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      contextsByMonth: Record<string, { scopeMonth: string }>;
      correlationId: string;
    };
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(payload.correlationId).toBe("test-correlation-id");
    expect(payload.contextsByMonth["2026-07"]?.scopeMonth).toBe("2026-07");
    expect(payload.contextsByMonth["2026-09"]?.scopeMonth).toBe("2026-09");
    expect(payload.contextsByMonth["2026-08"]).toBeUndefined();
  });
});
