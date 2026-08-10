import { describe, expect, it } from "vitest";
import { isAbortError, withAbortSignal } from "./abort";

describe("abort helpers", () => {
  it("detects abort errors", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("boom"))).toBe(false);
  });

  it("throws immediately when signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      withAbortSignal(Promise.resolve("ok"), controller.signal)
    ).toThrowError(/aborted/i);
  });

  it("rejects when aborted while pending", async () => {
    const controller = new AbortController();
    const pending = new Promise<string>(() => {});
    const wrapped = withAbortSignal(pending, controller.signal);
    controller.abort();

    await expect(wrapped).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
