// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  serverFrom: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.serverFrom,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.adminFrom,
  }),
}));

import { GET, POST } from "./route";

function buildServerFromStub() {
  return vi.fn((table: string) => {
    if (table !== "oauth_connections") {
      throw new Error(`Unexpected table ${table}`);
    }
    return {
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [
                {
                  provider: "google_calendar",
                  connection_status: "active",
                  last_sync_at: null,
                  token_expires_at: null,
                  scope: ["calendar.events"],
                  metadata: {},
                  created_at: "2026-08-14T00:00:00.000Z",
                  updated_at: "2026-08-14T00:00:00.000Z",
                },
              ],
              error: null,
            }),
        }),
      }),
    };
  });
}

function buildAdminFromStub() {
  return vi.fn((table: string) => {
    if (table !== "oauth_connections") {
      throw new Error(`Unexpected table ${table}`);
    }
    return {
      upsert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: {
                provider: "google_calendar",
                connection_status: "active",
                last_sync_at: null,
                token_expires_at: null,
                scope: ["calendar.events"],
                metadata: {},
                created_at: "2026-08-14T00:00:00.000Z",
                updated_at: "2026-08-14T00:00:00.000Z",
              },
              error: null,
            }),
        }),
      }),
    };
  });
}

describe("integration connections routes", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATIONS_ENABLED", "true");
    vi.stubEnv(
      "INTEGRATIONS_TOKEN_ENCRYPTION_KEY",
      Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")
    );
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.serverFrom.mockImplementation(buildServerFromStub());
    mocks.adminFrom.mockImplementation(buildAdminFromStub());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("lists integration connections", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      connections: [{ provider: "google_calendar", status: "active" }],
    });
  });

  it("saves an integration connection", async () => {
    const response = await POST(
      new Request("http://localhost/api/integrations/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google_calendar",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          scope: ["calendar.events"],
        }),
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      connection: { provider: "google_calendar", status: "active" },
    });
  });
});
