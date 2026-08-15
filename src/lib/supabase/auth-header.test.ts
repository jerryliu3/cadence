import { describe, expect, it } from "vitest";
import { readBearerToken } from "@/lib/supabase/auth-header";

describe("readBearerToken", () => {
  it("returns null when the header is absent", () => {
    expect(readBearerToken(new Request("http://localhost"))).toBeNull();
  });

  it("returns null for a non-bearer scheme", () => {
    expect(
      readBearerToken(
        new Request("http://localhost", {
          headers: { authorization: "Basic abc" },
        })
      )
    ).toBeNull();
  });

  it("returns null for an empty bearer value", () => {
    expect(
      readBearerToken(
        new Request("http://localhost", {
          headers: { authorization: "Bearer   " },
        })
      )
    ).toBeNull();
  });

  it("returns the token for a valid bearer header", () => {
    expect(
      readBearerToken(
        new Request("http://localhost", {
          headers: { authorization: "Bearer user-jwt" },
        })
      )
    ).toBe("user-jwt");
  });
});
