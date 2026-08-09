// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlePlannerSave: vi.fn(),
}));

vi.mock("../publish/route", () => ({
  handlePlannerSave: mocks.handlePlannerSave,
}));

import { POST, runtime } from "./route";

describe("planner save alias route", () => {
  beforeEach(() => {
    mocks.handlePlannerSave.mockReset();
  });

  it("delegates POST requests to the publish handler", async () => {
    const delegatedResponse = new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
    const request = new Request("http://localhost/api/planner/save", {
      method: "POST",
      body: JSON.stringify({ scopeMonth: "2026-08" }),
    });
    mocks.handlePlannerSave.mockResolvedValueOnce(delegatedResponse);

    const response = await POST(request);

    expect(mocks.handlePlannerSave).toHaveBeenCalledWith(request);
    expect(response).toBe(delegatedResponse);
  });

  it("uses node runtime", () => {
    expect(runtime).toBe("nodejs");
  });
});
