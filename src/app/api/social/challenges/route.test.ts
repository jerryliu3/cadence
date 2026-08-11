// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));

import { GET } from "./route";

describe("GET /api/social/challenges", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_ENABLED", "true");
    resetEnvCacheForTests();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "viewer-1" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "aug-completions",
          title: "August Completions",
          description: null,
          status: "active",
          enrollment: "opt_in",
          subject_kind: "user",
          metric: "completions_count",
          metric_track_key: null,
          target_value: 10,
          starts_at: "2026-08-01T00:00:00.000Z",
          ends_at: "2026-09-01T00:00:00.000Z",
          reward_xp: 25,
          max_participants: null,
          participant_count: 8,
          viewer_joined: true,
          viewer_progress: 3,
          viewer_completed_at: null,
          viewer_awarded_at: null,
        },
      ],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("returns 503 when social is disabled", async () => {
    vi.stubEnv("SOCIAL_ENABLED", "false");
    resetEnvCacheForTests();
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "social_disabled",
    });
  });

  it("returns challenge list for authenticated users", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      items: [
        {
          slug: "aug-completions",
          targetValue: 10,
          viewerJoined: true,
        },
      ],
    });
  });
});
