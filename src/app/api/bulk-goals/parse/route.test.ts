// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.adminRpc,
  }),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/bulk-goals/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("bulk goal parser route", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    vi.stubEnv("GEMINI_API_KEY", "test-api-key");
    mocks.adminRpc.mockImplementation((functionName: string) => {
      if (functionName === "consume_planner_ai_quota_service") {
        return Promise.resolve({
          data: [
            {
              usage_date: "2026-01-31",
              allowed: true,
              request_count: 1,
              remaining: 19,
              retry_after_seconds: 100,
            },
          ],
          error: null,
        });
      }
      if (functionName === "record_planner_ai_output_tokens_service") {
        return Promise.resolve({ data: 10, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T11:30:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("authenticates before validating the body", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await POST(request(null));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "authentication_required",
    });
  });

  it("requires a validated IANA timezone", async () => {
    const response = await POST(
      request({ prompt: "Read every day", timezone: "Mars/Olympus" })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
    });
  });

  it("rejects request bodies above the parser byte budget", async () => {
    const response = await POST(
      request({ prompt: "x".repeat(33 * 1024), timezone: "UTC" })
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "request_too_large",
    });
  });

  it("returns retry guidance when daily parser quota is exhausted", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mocks.adminRpc.mockImplementation((functionName: string) => {
      if (functionName === "consume_planner_ai_quota_service") {
        return Promise.resolve({
          data: [
            {
              usage_date: "2026-01-31",
              allowed: false,
              request_count: 20,
              remaining: 0,
              retry_after_seconds: 321,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      request({ prompt: "Read every day", timezone: "UTC" })
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("321");
    await expect(response.json()).resolves.toMatchObject({
      code: "quota_exceeded",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the requested local date and preserves generated descriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        goals: [
                          {
                            title: "Read",
                            description: "Read focused material",
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )
    );

    const response = await POST(
      request({
        prompt: "Read every day",
        timezone: "Pacific/Auckland",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      goals: [
        {
          title: "Read",
          description: "Read focused material",
          start_date: "2026-02-01",
        },
      ],
    });
  });

  it("does not expose provider response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("provider-secret-debug-body", { status: 500 })
        )
    );

    const response = await POST(
      request({ prompt: "Read every day", timezone: "UTC" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ code: "ai_provider_error" });
    expect(JSON.stringify(body)).not.toContain("provider-secret");
  });
});
