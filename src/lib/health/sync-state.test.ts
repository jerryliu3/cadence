import { describe, expect, it } from "vitest";
import { deriveHealthSyncState } from "./sync-state";

describe("deriveHealthSyncState", () => {
  const now = Date.parse("2026-08-14T18:00:00.000Z");

  it("returns never_asked when there is no prompt and no samples", () => {
    expect(
      deriveHealthSyncState({
        permissionPromptedAt: null,
        lastSampleAt: null,
        now,
      })
    ).toBe("never_asked");
  });

  it("returns asked after a permission prompt with no samples", () => {
    expect(
      deriveHealthSyncState({
        permissionPromptedAt: "2026-08-14T12:00:00.000Z",
        lastSampleAt: null,
        now,
      })
    ).toBe("asked");
  });

  it("returns receiving_data for a recent sample", () => {
    expect(
      deriveHealthSyncState({
        permissionPromptedAt: "2026-08-14T12:00:00.000Z",
        lastSampleAt: "2026-08-14T17:00:00.000Z",
        now,
      })
    ).toBe("receiving_data");
  });

  it("returns stale when the last sample is older than 36 hours", () => {
    expect(
      deriveHealthSyncState({
        permissionPromptedAt: "2026-08-12T12:00:00.000Z",
        lastSampleAt: "2026-08-12T17:00:00.000Z",
        now,
      })
    ).toBe("stale");
  });
});
