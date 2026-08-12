import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTabDataCacheForTests } from "@/lib/cache/tab-data-cache";
import {
  fetchProgressContext,
  isProgressContextAuthenticationError,
} from "./progress-context";

function buildProgressPayload(correlationId: string) {
  return {
    schemaVersion: "1" as const,
    asOfDate: "2026-08-05",
    timezone: "UTC",
    summaries: [],
    facts: [],
    truncated: false as const,
    correlationId,
  };
}

describe("fetchProgressContext", () => {
  afterEach(() => {
    resetTabDataCacheForTests();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("serves repeated identical requests from the client cache", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(buildProgressPayload("cache-hit")), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchSpy);

    const first = await fetchProgressContext({
      asOfDate: "2026-08-05",
      timezone: "UTC",
      viewDate: "2026-08-05",
    });
    const second = await fetchProgressContext({
      asOfDate: "2026-08-05",
      timezone: "UTC",
      viewDate: "2026-08-05",
    });

    expect(first.correlationId).toBe("cache-hit");
    expect(second.correlationId).toBe("cache-hit");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps cached payloads available for tab-scale revisit windows", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    const fetchSpy = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify(buildProgressPayload("tab-ttl")), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    nowSpy.mockReturnValue(1_000_000);
    await fetchProgressContext({
      asOfDate: "2026-08-08",
      timezone: "UTC",
      viewDate: "2026-08-08",
    });

    nowSpy.mockReturnValue(1_000_000 + 20 * 60 * 1000);
    await fetchProgressContext({
      asOfDate: "2026-08-08",
      timezone: "UTC",
      viewDate: "2026-08-08",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("bypasses cached payloads when forceRefresh is requested", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildProgressPayload("before-refresh")), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildProgressPayload("after-refresh")), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchSpy);

    const first = await fetchProgressContext({
      asOfDate: "2026-08-06",
      timezone: "UTC",
      viewDate: "2026-08-06",
    });
    const refreshed = await fetchProgressContext({
      asOfDate: "2026-08-06",
      timezone: "UTC",
      viewDate: "2026-08-06",
      forceRefresh: true,
    });

    expect(first.correlationId).toBe("before-refresh");
    expect(refreshed.correlationId).toBe("after-refresh");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("raises a typed authentication error for auth-required API responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "authentication_required",
            message: "Sign in to continue.",
            correlationId: "auth-corr-id",
          }),
          { status: 401 }
        )
      )
    );

    await expect(
      fetchProgressContext({
        asOfDate: "2026-08-07",
        timezone: "UTC",
        viewDate: "2026-08-07",
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(isProgressContextAuthenticationError(error)).toBe(true);
      expect(
        error instanceof Error ? error.message : ""
      ).toContain("Sign in to continue");
      if (isProgressContextAuthenticationError(error)) {
        expect(error.correlationId).toBe("auth-corr-id");
      }
      return true;
    });
  });
});
