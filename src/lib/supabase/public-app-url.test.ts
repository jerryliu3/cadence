import { describe, expect, it } from "vitest";
import { resolveAuthRedirectBaseUrl } from "@/lib/supabase/public-app-url";

describe("resolveAuthRedirectBaseUrl", () => {
  const productionOrigin = "https://goalmaxxing.xyz";

  it("falls back to browser origin when app URL is not configured", () => {
    expect(resolveAuthRedirectBaseUrl(undefined, productionOrigin)).toBe(productionOrigin);
    expect(resolveAuthRedirectBaseUrl("   ", productionOrigin)).toBe(productionOrigin);
  });

  it("uses configured origin when app URL is valid", () => {
    expect(resolveAuthRedirectBaseUrl("https://goalmaxxing.xyz/app", productionOrigin)).toBe(
      "https://goalmaxxing.xyz"
    );
    expect(resolveAuthRedirectBaseUrl("https://goalmaxxing.xyz/", productionOrigin)).toBe(
      "https://goalmaxxing.xyz"
    );
  });

  it("falls back to browser origin when configured URL is invalid", () => {
    expect(resolveAuthRedirectBaseUrl("goalmaxxing.xyz", productionOrigin)).toBe(
      productionOrigin
    );
  });

  it("ignores localhost config when browser origin is non-localhost", () => {
    expect(resolveAuthRedirectBaseUrl("http://localhost:3000", productionOrigin)).toBe(
      productionOrigin
    );
    expect(resolveAuthRedirectBaseUrl("http://127.0.0.1:3000", productionOrigin)).toBe(
      productionOrigin
    );
  });

  it("keeps localhost config during local development", () => {
    expect(
      resolveAuthRedirectBaseUrl("http://127.0.0.1:3000", "http://localhost:3100")
    ).toBe("http://127.0.0.1:3000");
  });
});
