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

  it("accepts only absolute http/https avatar URLs", () => {
    expect(getAvatarUrlValidationError(null)).toBeNull();
    expect(
      getAvatarUrlValidationError("https://cdn.example.com/avatar.png")
    ).toBeNull();
    expect(getAvatarUrlValidationError("ftp://cdn.example.com/avatar.png")).toBe(
      "Avatar URL must start with http:// or https://."
    );
    expect(getAvatarUrlValidationError("/avatar.png")).toBe(
      "Avatar URL must be a valid absolute URL."
    );
  });
});
