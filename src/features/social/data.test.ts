import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTabDataCacheForTests } from "@/lib/cache/tab-data-cache";
import {
  fetchSocialChallenges,
  joinSocialChallenge,
} from "@/features/social/data";

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
});
