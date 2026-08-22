import { describe, expect, it } from "vitest";
import {
  encodeSupabaseSessionCookie,
  resolveSupabaseAuthCookieName,
} from "@/lib/supabase/auth-cookie";

describe("supabase auth cookie helpers", () => {
  it("derives the auth cookie key from a local supabase URL", () => {
    expect(resolveSupabaseAuthCookieName("http://127.0.0.1:54321")).toBe(
      "sb-127-auth-token"
    );
    expect(resolveSupabaseAuthCookieName("http://localhost:54321")).toBe(
      "sb-localhost-auth-token"
    );
  });

  it("encodes a supabase session payload with the expected prefix", () => {
    const value = encodeSupabaseSessionCookie({
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: 1_234_567_890,
      user: { id: "user-id" },
    });

    expect(value.startsWith("base64-")).toBe(true);
    const decoded = JSON.parse(
      Buffer.from(value.slice("base64-".length), "base64").toString("utf8")
    ) as { weak_password?: null };
    expect(decoded.weak_password).toBeNull();
  });
});
