import { afterEach, describe, expect, it } from "vitest";
import {
  parseDuoScopeCookieValue,
  writeDuoScopeCookie,
} from "@/lib/social/duo/scope-cookie";

describe("duo scope cookie", () => {
  afterEach(() => {
    document.cookie = "duo_scope=; Path=/; Max-Age=0; SameSite=Lax";
  });

  it("parses only me, partner, and both", () => {
    expect(parseDuoScopeCookieValue("me")).toBe("me");
    expect(parseDuoScopeCookieValue("partner")).toBe("partner");
    expect(parseDuoScopeCookieValue("both")).toBe("both");
    expect(parseDuoScopeCookieValue("other")).toBeNull();
    expect(parseDuoScopeCookieValue(null)).toBeNull();
  });

  it("writes and clears the cookie from the setter path", () => {
    writeDuoScopeCookie("both");
    expect(document.cookie).toContain("duo_scope=both");
    writeDuoScopeCookie(null);
    expect(document.cookie).not.toContain("duo_scope=both");
  });
});
