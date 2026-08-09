// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlePlannerReset: vi.fn(),
}));

vi.mock("../schedule/route", () => ({
  handlePlannerReset: mocks.handlePlannerReset,
}));

import { POST, runtime } from "./route";

describe("planner reset alias route", () => {
  beforeEach(() => {
    mocks.handlePlannerReset.mockReset();
  });

  it("delegates POST requests to the schedule reset handler", async () => {
    const delegatedResponse = new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
    const request = new Request("http://localhost/api/planner/reset", {
      method: "POST",
      body: JSON.stringify({ scopeMonth: "2026-08" }),
    });
    mocks.handlePlannerReset.mockResolvedValueOnce(delegatedResponse);

    const response = await POST(request);

    expect(mocks.handlePlannerReset).toHaveBeenCalledWith(request);
    expect(response).toBe(delegatedResponse);
  });

  it("uses node runtime", () => {
    expect(runtime).toBe("nodejs");
  });
});
