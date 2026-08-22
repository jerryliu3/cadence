import { describe, expect, it } from "vitest";
import { buildLoginHref, resolveSafePostLoginPath } from "./login-redirect";

describe("login redirect helpers", () => {
  it("remaps known legacy app destinations", () => {
    expect(resolveSafePostLoginPath("/insights?tab=year#focus")).toBe(
      "/app/insights?tab=year#focus"
    );
    expect(resolveSafePostLoginPath("/calendar?month=2026-08")).toBe(
      "/app/calendar?month=2026-08"
    );
    expect(resolveSafePostLoginPath("/")).toBe("/app");
  });

  it("keeps unknown safe paths untouched", () => {
    expect(resolveSafePostLoginPath("/goals/new")).toBe("/goals/new");
    expect(resolveSafePostLoginPath("/app/social?tab=team")).toBe(
      "/app/social?tab=team"
    );
  });

  it("blocks protocol-relative destinations", () => {
    expect(resolveSafePostLoginPath("//evil.com/phish")).toBe("/app");
  });

  it("blocks backslash-normalized external destinations", () => {
    expect(resolveSafePostLoginPath("/\\evil.com/phish")).toBe("/app");
  });

  it("blocks absolute external URLs", () => {
    expect(resolveSafePostLoginPath("https://evil.com/phish")).toBe("/app");
  });

  it("blocks redirects back into login routes", () => {
    expect(resolveSafePostLoginPath("/login")).toBe("/app");
    expect(resolveSafePostLoginPath("/login/reset")).toBe("/app");
  });

  it("builds login href with sanitized next parameter", () => {
    expect(buildLoginHref("/\\evil.com")).toBe("/login?next=%2Fapp");
    expect(buildLoginHref("/settings?tab=profile")).toBe(
      "/login?next=%2Fapp%2Fsettings%3Ftab%3Dprofile"
    );
  });
});
