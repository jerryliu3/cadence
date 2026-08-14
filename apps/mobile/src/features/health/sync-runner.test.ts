import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postHealthSamples: vi.fn(),
  loadHealthKitAnchors: vi.fn(),
  saveHealthKitAnchors: vi.fn(),
  loadHealthConnectChangesToken: vi.fn(),
  saveHealthConnectChangesToken: vi.fn(),
}));

vi.mock("./sync-client", () => ({
  deviceLocalToday: () => "2026-08-14",
  postHealthSamples: mocks.postHealthSamples,
  loadHealthKitAnchors: mocks.loadHealthKitAnchors,
  saveHealthKitAnchors: mocks.saveHealthKitAnchors,
  loadHealthConnectChangesToken: mocks.loadHealthConnectChangesToken,
  saveHealthConnectChangesToken: mocks.saveHealthConnectChangesToken,
}));

import type { HealthKitBridge } from "./ios-healthkit";
import { reportHealthSyncFailure, syncAppleHealth } from "./sync-runner";

describe("health sync runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postHealthSamples.mockResolvedValue({});
    mocks.loadHealthKitAnchors.mockResolvedValue({});
    mocks.saveHealthKitAnchors.mockResolvedValue(undefined);
  });

  it("posts samples with offset-derived localToday and never calls revokeAllPermissions", async () => {
    const bridge: HealthKitBridge = {
      requestAuthorization: vi.fn(async () => true),
      queryQuantitySamplesWithAnchor: vi.fn(async () => ({
        samples: [],
        newAnchor: "a1",
      })),
      enableBackgroundDelivery: vi.fn(async () => true),
      subscribeToChanges: vi.fn(() => ({ remove: vi.fn() })),
    };
    await syncAppleHealth(bridge);
    expect(mocks.postHealthSamples).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "apple_healthkit",
        localToday: "2026-08-14",
        permissionPrompted: true,
      })
    );
    expect(JSON.stringify(bridge)).not.toMatch(/revokeAllPermissions/);
  });

  it("records a sync failure without raw health values", async () => {
    await reportHealthSyncFailure("apple_healthkit", new Error("denied"));
    expect(mocks.postHealthSamples).toHaveBeenCalledWith({
      provider: "apple_healthkit",
      permissionPrompted: true,
      lastError: "denied",
      samples: [],
    });
  });
});
