import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProgressContext } from "./progress-context";

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
});
