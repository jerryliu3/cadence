import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTabDataCacheForTests } from "@/lib/cache/tab-data-cache";
import {
  fetchSocialChallenges,
  fetchSocialFreshness,
  fetchSocialFeedPage,
  joinSocialChallenge,
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

  it("invalidates social tab cache after challenge mutations", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/social/challenges") && method === "GET") {
        return Response.json({
          schemaVersion: "1",
          items: [],
        });
      }
      if (url.includes("/api/social/challenges/challenge-1/join") && method === "POST") {
        return Response.json({
          schemaVersion: "1",
          joined: true,
        });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSocialChallenges();
    await fetchSocialChallenges();
    await joinSocialChallenge("challenge-1");
    await fetchSocialChallenges();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not cache social freshness responses", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({
        schemaVersion: "1",
        freshness: {
          serverNow: "2026-08-22T15:45:21.000Z",
          nextExpectedRefreshAt: "2026-08-22T15:46:00.000Z",
          leaderboardRefreshedAt: "2026-08-22T15:44:05.000Z",
          challengesRefreshedAt: "2026-08-22T15:44:35.000Z",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchSocialFreshness();
    await fetchSocialFreshness();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
