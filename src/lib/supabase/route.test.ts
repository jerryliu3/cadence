// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCookieClient: vi.fn(),
  createTokenClient: vi.fn(),
  getSupabaseConfig: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createCookieClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createTokenClient,
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: mocks.getSupabaseConfig,
}));

import { createRouteClient } from "./route";

describe("createRouteClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseConfig.mockReturnValue({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key",
    });
  });

  it("uses the cookie client when the request has no bearer token", async () => {
    const cookieClient = { kind: "cookie" };
    mocks.createCookieClient.mockResolvedValue(cookieClient);

    await expect(
      createRouteClient(new Request("http://localhost/api/example"))
    ).resolves.toEqual({
      supabase: cookieClient,
      accessToken: null,
    });

    expect(mocks.createCookieClient).toHaveBeenCalledOnce();
    expect(mocks.createTokenClient).not.toHaveBeenCalled();
  });

  it("uses an anonymous token client with non-persistent auth for bearer requests", async () => {
    const tokenClient = { kind: "token" };
    mocks.createTokenClient.mockReturnValue(tokenClient);

    const result = await createRouteClient(
      new Request("http://localhost/api/example", {
        headers: { authorization: "Bearer user-jwt" },
      })
    );

    expect(result).toEqual({
      supabase: tokenClient,
      accessToken: "user-jwt",
    });
    expect(mocks.createCookieClient).not.toHaveBeenCalled();
    expect(mocks.createTokenClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      {
        global: {
          headers: {
            Authorization: "Bearer user-jwt",
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  });
});
