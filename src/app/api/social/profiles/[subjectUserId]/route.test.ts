// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedRequestContext: vi.fn(),
  createAdminClient: vi.fn(),
  loadPublicProfileBundle: vi.fn(),
}));

vi.mock("@/lib/api/route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/route")>();
  return {
    ...actual,
    requireAuthenticatedRequestContext: mocks.requireAuthenticatedRequestContext,
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/social/public-profile", () => ({
  loadPublicProfileBundle: mocks.loadPublicProfileBundle,
}));

import { GET } from "./route";

describe("GET /api/social/profiles/[subjectUserId]", () => {
  beforeEach(() => {
    mocks.requireAuthenticatedRequestContext.mockResolvedValue({
      userId: "viewer-1",
      supabase: {},
    });
    mocks.createAdminClient.mockReturnValue({ kind: "admin" });
    mocks.loadPublicProfileBundle.mockResolvedValue({
      schemaVersion: "1",
      profile: {
        subjectUserId: "11111111-1111-4111-8111-111111111111",
        username: "subject",
        displayName: "Subject User",
        avatarUrl: null,
        isPrivate: false,
      },
      xp: null,
      globalAchievements: [],
      overallStats: null,
      yearHeatmap: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns bundled profile data for valid requests", async () => {
    const subjectUserId = "11111111-1111-4111-8111-111111111111";
    const response = await GET(
      new Request(`http://localhost/api/social/profiles/${subjectUserId}?year=2026`),
      { params: { subjectUserId } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "1",
      item: {
        profile: {
          subjectUserId,
        },
      },
    });
    expect(mocks.loadPublicProfileBundle).toHaveBeenCalledWith({
      admin: { kind: "admin" },
      viewerUserId: "viewer-1",
      subjectUserId,
      selectedYear: 2026,
    });
  });

  it("returns validation_failed for invalid subject ids", async () => {
    const response = await GET(
      new Request("http://localhost/api/social/profiles/not-a-uuid"),
      { params: { subjectUserId: "not-a-uuid" } }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
    });
    expect(mocks.loadPublicProfileBundle).not.toHaveBeenCalled();
  });
});
