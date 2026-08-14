import { describe, expect, it } from "vitest";
import { HEALTH_DISCONNECT_COPY } from "@cadence/shared/health/providers";

describe("health privacy copy", () => {
  it("tells users to revoke permissions in the OS and restart", () => {
    expect(HEALTH_DISCONNECT_COPY).toMatch(/restart the app/i);
    expect(HEALTH_DISCONNECT_COPY).not.toMatch(/revokeAllPermissions/);
  });
});
