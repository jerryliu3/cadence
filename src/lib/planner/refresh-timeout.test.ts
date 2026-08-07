import { describe, expect, it, vi } from "vitest";
import { withPlannerRefreshTimeout } from "./refresh-timeout";

describe("withPlannerRefreshTimeout", () => {
  it("returns operation result before timeout", async () => {
    await expect(
      withPlannerRefreshTimeout({
        operation: Promise.resolve("ok"),
        timeoutMessage: "timed out",
      })
    ).resolves.toBe("ok");
  });

  it("throws timeout error when operation stalls", async () => {
    vi.useFakeTimers();
    try {
      const promise = withPlannerRefreshTimeout({
        operation: new Promise<string>(() => undefined),
        timeoutMs: 25,
        timeoutMessage: "refresh timed out",
      });
      const assertion = expect(promise).rejects.toThrow("refresh timed out");
      await vi.advanceTimersByTimeAsync(30);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
