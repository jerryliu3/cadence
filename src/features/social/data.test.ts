import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTabDataCacheForTests } from "@/lib/cache/tab-data-cache";
import {
  fetchSocialChallenges,
  fetchSocialFeedPage,
} from "@/features/social/data";

describe("social data cache", () => {
  afterEach(() => {
    resetTabDataCacheForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("serves repeated challenge reads from the tab cache window", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({
        schemaVersion: "1",
        items: [],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchSocialChallenges();
    await fetchSocialChallenges();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revalidates feed pages after a short TTL window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({
        schemaVersion: "1",
        items: [],
        nextCursor: null,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchSocialFeedPage({ scope: "global", limit: 20 });
    await fetchSocialFeedPage({ scope: "global", limit: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));
    await fetchSocialFeedPage({ scope: "global", limit: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
