import { afterEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  resetRateLimitBucketsForTests,
} from "./rate-limit";

describe("rate limit", () => {
  afterEach(() => {
    resetRateLimitBucketsForTests();
  });

  it("allows traffic under the limit", () => {
    const first = checkRateLimit({ key: "a", limit: 2, windowMs: 1_000, now: 100 });
    const second = checkRateLimit({ key: "a", limit: 2, windowMs: 1_000, now: 200 });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it("blocks once the window is full", () => {
    checkRateLimit({ key: "b", limit: 1, windowMs: 1_000, now: 0 });
    const blocked = checkRateLimit({ key: "b", limit: 1, windowMs: 1_000, now: 100 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(900);
  });

  it("resets after the window elapses", () => {
    checkRateLimit({ key: "c", limit: 1, windowMs: 1_000, now: 0 });
    const after = checkRateLimit({ key: "c", limit: 1, windowMs: 1_000, now: 1_001 });
    expect(after.allowed).toBe(true);
  });
});
