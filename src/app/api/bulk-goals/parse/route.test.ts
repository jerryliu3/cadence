// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminRpc: vi.fn(),
  goalCategoriesQuery: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === "goal_categories") {
        return {
          select: () => ({
            order: (...args: unknown[]) => mocks.goalCategoriesQuery(...args),
          }),
        };
      }
      throw new Error(`Unexpected table in bulk-goals parser test: ${table}`);
    },
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
    mocks.goalCategoriesQuery.mockResolvedValue({
      data: [
        {
          key: "personal",
          label: "Personal",
          aliases: ["habits"],
          color: "#6366f1",
          sort_order: 10,
        },
        {
          key: "other",
          label: "Other",
          aliases: ["general"],
          color: "#64748b",
          sort_order: 999,
        },
      ],
      error: null,
    });
    vi.stubEnv("GEMINI_API_KEY", "test-api-key");
    resetEnvCacheForTests();
    mocks.adminRpc.mockImplementation((functionName: string) => {
      if (functionName === "consume_planner_ai_quota") {
        return Promise.resolve({
          data: [
            {
              quota_usage_date: "2026-01-31",
              allowed: true,
              request_count: 1,
              remaining: 19,
              retry_after_seconds: 100,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T11:30:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
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
      if (functionName === "consume_planner_ai_quota") {
        return Promise.resolve({
          data: [
            {
              quota_usage_date: "2026-01-31",
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

  it("accepts fixed milestone drafts with milestone_names from model output", async () => {
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
                            title: "5k training block",
                            frequency_type: "fixed_milestones",
                            target_count: 3,
                            start_date: "2026-08-17",
                            end_date: "2026-09-13",
                            milestone_names: [
                              "Easy run 3 mi",
                              "Tempo run 4x800",
                              "Long run 6 mi",
                            ],
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
        prompt: "Build me a 4-week 5k progression plan.",
        timezone: "UTC",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      goals: [
        {
          title: "5k training block",
          frequency_type: "fixed_milestones",
          milestone_names: [
            "Easy run 3 mi",
            "Tempo run 4x800",
            "Long run 6 mi",
          ],
        },
      ],
    });
  });

  it("rejects model outputs when milestone_names are malformed", async () => {
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
                            title: "5k training block",
                            frequency_type: "fixed_milestones",
                            target_count: 2,
                            start_date: "2026-08-17",
                            end_date: "2026-08-31",
                            milestone_names: ["Easy run", 42],
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
        prompt: "Build a short running plan.",
        timezone: "UTC",
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "ai_invalid_output",
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

  it("retries without response schema when provider rejects schema arguments", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: "Request contains an invalid argument.",
              status: "INVALID_ARGUMENT",
            },
          }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: "Request contains an invalid argument.",
              status: "INVALID_ARGUMENT",
            },
          }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        goals: [{ title: "Read every day" }],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      request({ prompt: "Read every day", timezone: "UTC" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      goals: [{ title: "Read every day" }],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const firstBody = JSON.parse(
      String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "")
    ) as { generationConfig?: { responseSchema?: unknown } };
    const thirdBody = JSON.parse(
      String((fetchSpy.mock.calls[2]?.[1] as RequestInit | undefined)?.body ?? "")
    ) as { generationConfig?: { responseSchema?: unknown } };
    expect(firstBody.generationConfig?.responseSchema).toBeDefined();
    expect(thirdBody.generationConfig?.responseSchema).toBeUndefined();
  });

  it("guides training-plan prompts toward milestones in schema and instructions", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      goals: [{ title: "Training plan" }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      request({
        prompt: "Create a 5k plan for four weeks.",
        timezone: "UTC",
      })
    );

    expect(response.status).toBe(200);
    const firstBody = JSON.parse(
      String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "")
    ) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
      generationConfig?: {
        responseSchema?: {
          properties?: {
            goals?: {
              items?: {
                properties?: Record<string, unknown>;
              };
            };
          };
        };
      };
    };
    const promptText = firstBody.contents?.[0]?.parts?.[0]?.text ?? "";
    expect(promptText).toContain(
      "Think briefly about plan structure before responding"
    );
    expect(promptText).toContain(
      'Choose "fixed_milestones" for ordered programs where sessions differ over time'
    );
    expect(promptText).toContain(
      "Never create one goal per workout, session, or date."
    );
    expect(
      firstBody.generationConfig?.responseSchema?.properties?.goals?.items
        ?.properties
    ).toHaveProperty("milestone_names");
  });

  it("uses DB-backed category keys in generated output validation", async () => {
    mocks.goalCategoriesQuery.mockResolvedValue({
      data: [
        {
          key: "personal",
          label: "Personal",
          aliases: ["habits"],
          color: "#6366f1",
          sort_order: 10,
        },
        {
          key: "focus",
          label: "Focus",
          aliases: ["deep work"],
          color: "#0ea5e9",
          sort_order: 20,
        },
        {
          key: "other",
          label: "Other",
          aliases: ["general"],
          color: "#64748b",
          sort_order: 999,
        },
      ],
      error: null,
    });
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
                            title: "Deep work block",
                            category_key: "focus",
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
        prompt: "Schedule deep work blocks",
        timezone: "UTC",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      goals: [{ category_key: "focus" }],
    });
  });
});
