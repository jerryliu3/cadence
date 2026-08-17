import { describe, expect, it } from "vitest";
import {
  getAvatarUrlValidationError,
  normalizeAvatarUrlDraft,
} from "@/features/social/avatar-url";

describe("avatar URL helpers", () => {
  it("normalizes blank draft values to null", () => {
    expect(normalizeAvatarUrlDraft("   ")).toBeNull();
    expect(normalizeAvatarUrlDraft("https://example.com/a.png")).toBe(
      "https://example.com/a.png"
    );
  });

  it("accepts only absolute http/https avatar URLs on public avatars storage", () => {
    expect(getAvatarUrlValidationError(null)).toBeNull();
    expect(
      getAvatarUrlValidationError(
        "https://project.supabase.co/storage/v1/object/public/avatars/123/avatar.jpg?v=2"
      )
    ).toBeNull();
    expect(getAvatarUrlValidationError("ftp://cdn.example.com/avatar.png")).toBe(
      "Avatar URL must start with http:// or https://."
    );
    expect(getAvatarUrlValidationError("/avatar.png")).toBe(
      "Avatar URL must be a valid absolute URL."
    );
    expect(
      getAvatarUrlValidationError(
        "https://project.supabase.co/storage/v1/object/public/goal-photos/123/avatar.jpg"
      )
    ).toBe("Avatar URL must point to the public avatars storage path.");
  });
});
