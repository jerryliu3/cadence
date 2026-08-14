import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import {
  decryptIntegrationToken,
  encryptIntegrationToken,
} from "@/lib/integrations/token-crypto";

const key = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

describe("integration token crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("encrypts and decrypts token payloads", () => {
    vi.stubEnv("INTEGRATIONS_TOKEN_ENCRYPTION_KEY", key);
    resetEnvCacheForTests();
    const encrypted = encryptIntegrationToken("refresh-token-123");
    expect(encrypted).not.toContain("refresh-token-123");
    expect(decryptIntegrationToken(encrypted)).toBe("refresh-token-123");
  });
});
