// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
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
