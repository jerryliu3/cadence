// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.adminFrom,
  }),
}));

import { DELETE } from "./route";

function buildAdminFromStub() {
  return vi.fn((table: string) => {
    if (table !== "oauth_connections") {
      throw new Error(`Unexpected table ${table}`);
    }
    return {
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    provider: "google_calendar",
                    connection_status: "revoked",
                  },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    };
  });
}

describe("DELETE /api/integrations/connections/[provider]", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATIONS_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    mocks.adminFrom.mockImplementation(buildAdminFromStub());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("revokes provider connection", async () => {
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ provider: "google_calendar" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      provider: "google_calendar",
      status: "revoked",
    });
  });
});
