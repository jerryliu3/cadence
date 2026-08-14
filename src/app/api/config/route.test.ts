// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  getFeatureFlags: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/lib/feature-flags", () => ({
  getFeatureFlags: mocks.getFeatureFlags,
}));

import { GET } from "./route";

describe("GET /api/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({
      MOBILE_MIN_SUPPORTED_APP_VERSION: "1.0.0",
    });
    mocks.getFeatureFlags.mockReturnValue({
      crossMonthMovesEnabled: true,
      xpEnabled: false,
      socialEnabled: true,
      futureInternalOnly: true,
    });
  });

  it("returns a stable cacheable payload without a request correlation id", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      schemaVersion: "1",
      minSupportedAppVersion: "1.0.0",
      flags: {
        crossMonthMovesEnabled: true,
        xpEnabled: false,
        socialEnabled: true,
      },
    });
    expect(payload.correlationId).toBeUndefined();
    expect(payload.flags.futureInternalOnly).toBeUndefined();
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("returns a correlation id when flag loading fails", async () => {
    mocks.getFeatureFlags.mockImplementation(() => {
      throw new Error("env exploded");
    });
    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "internal_error",
      correlationId: expect.any(String),
    });
  });
});
