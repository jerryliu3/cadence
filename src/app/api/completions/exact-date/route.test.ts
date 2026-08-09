// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleCompletionPost: vi.fn(),
}));

vi.mock("../route", () => ({
  handleCompletionPost: mocks.handleCompletionPost,
}));

import { POST, runtime } from "./route";

describe("completions exact-date alias route", () => {
  beforeEach(() => {
    mocks.handleCompletionPost.mockReset();
  });

  it("delegates POST requests to the canonical completions handler", async () => {
    const delegatedResponse = new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
    const request = new Request("http://localhost/api/completions/exact-date", {
      method: "POST",
      body: JSON.stringify({ goalId: "goal-1" }),
    });
    mocks.handleCompletionPost.mockResolvedValueOnce(delegatedResponse);

    const response = await POST(request);

    expect(mocks.handleCompletionPost).toHaveBeenCalledWith(request);
    expect(response).toBe(delegatedResponse);
  });

  it("uses node runtime", () => {
    expect(runtime).toBe("nodejs");
  });
});
