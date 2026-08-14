import { describe, expect, it, vi } from "vitest";
import { createApiClient, getJson } from "@/lib/api/client";

function jsonOk() {
  return new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client credentials", () => {
  it("sends cookies on the default web client", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonOk());
    await getJson("/api/planner/context", { fetcher });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
    });
  });

  it("keeps an explicit omit default for native clients", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonOk());
    const client = createApiClient({ credentials: "omit", fetcher });
    await client.getJson("/api/planner/context");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
    });
  });

  it("supports deleteJson on configured clients", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonOk());
    const client = createApiClient({ credentials: "omit", fetcher });
    await client.deleteJson("/api/social/team");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/social/team");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "DELETE",
      credentials: "omit",
    });
  });
});
