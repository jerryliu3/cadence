import { describe, expect, it } from "vitest";
import {
  buildMobileAvatarCleanupPathsForProfileChange,
  getMobileCanonicalAvatarObjectPath,
  resolveMobileAvatarObjectPathFromUrl,
} from "./avatar-upload-paths";

describe("mobile avatar upload path helpers", () => {
  it("uses a canonical per-user avatar object path", () => {
    expect(getMobileCanonicalAvatarObjectPath("user-1")).toBe("user-1/avatar.jpg");
  });

  it("extracts object path from public avatar URL", () => {
    expect(
      resolveMobileAvatarObjectPathFromUrl(
        "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?v=2"
      )
    ).toBe("user-1/avatar.jpg");
  });

  it("does not schedule cleanup for in-place replacement at canonical path", () => {
    expect(
      buildMobileAvatarCleanupPathsForProfileChange({
        userId: "user-1",
        previousAvatarUrl:
          "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?v=1",
        nextAvatarUrl:
          "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?v=2",
      })
    ).toEqual([]);
  });

  it("deletes canonical object when avatar is cleared", () => {
    expect(
      buildMobileAvatarCleanupPathsForProfileChange({
        userId: "user-1",
        previousAvatarUrl:
          "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?v=2",
        nextAvatarUrl: null,
      })
    ).toEqual(["user-1/avatar.jpg"]);
  });

  it("ignores foreign-user object paths during cleanup planning", () => {
    expect(
      buildMobileAvatarCleanupPathsForProfileChange({
        userId: "user-1",
        previousAvatarUrl:
          "https://project.supabase.co/storage/v1/object/public/avatars/user-2/avatar.jpg?v=2",
        nextAvatarUrl:
          "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?v=3",
      })
    ).toEqual([]);
  });
});
