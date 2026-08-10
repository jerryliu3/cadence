import { describe, expect, it } from "vitest";
import { buildLoginHref, resolveSafePostLoginPath } from "./login-redirect";

describe("login redirect helpers", () => {
  it("keeps safe in-origin relative destinations", () => {
    expect(resolveSafePostLoginPath("/insights?tab=year#focus")).toBe(
      "/insights?tab=year#focus"
    );
  });

  it("blocks protocol-relative destinations", () => {
    expect(resolveSafePostLoginPath("//evil.com/phish")).toBe("/");
  });

  it("blocks backslash-normalized external destinations", () => {
    expect(resolveSafePostLoginPath("/\\evil.com/phish")).toBe("/");
  });

  it("blocks absolute external URLs", () => {
    expect(resolveSafePostLoginPath("https://evil.com/phish")).toBe("/");
  });

  it("blocks redirects back into login routes", () => {
    expect(resolveSafePostLoginPath("/login")).toBe("/");
    expect(resolveSafePostLoginPath("/login/reset")).toBe("/");
  });

  it("builds login href with sanitized next parameter", () => {
    expect(buildLoginHref("/\\evil.com")).toBe("/login?next=%2F");
    expect(buildLoginHref("/settings?tab=profile")).toBe(
      "/login?next=%2Fsettings%3Ftab%3Dprofile"
    );
  });
});
