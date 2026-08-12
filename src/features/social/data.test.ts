import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTabDataCacheForTests } from "@/lib/cache/tab-data-cache";
import { fetchSocialChallenges } from "@/features/social/data";

describe("social data cache", () => {
  afterEach(() => {
    resetTabDataCacheForTests();
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
});
