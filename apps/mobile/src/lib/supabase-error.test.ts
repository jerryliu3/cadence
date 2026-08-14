import { describe, expect, it } from "vitest";
import { sanitizeMobileSupabaseError } from "./supabase-error";

describe("sanitizeMobileSupabaseError", () => {
  it("keeps only fixed message and optional code", () => {
    const error = sanitizeMobileSupabaseError({
      userMessage: "Checklist goals could not be loaded.",
      error: {
        code: "42501",
        message: "row violates policy for owner_id=11111111-1111-4111-8111-111111111111",
        details: "filter: owner_id=11111111-1111-4111-8111-111111111111",
        hint: "Check UUID 22222222-2222-4222-8222-222222222222",
      },
    });

    expect(error.message).toBe("Checklist goals could not be loaded.");
    expect(error.code).toBe("42501");

    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain("owner_id");
    expect(serialized).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(serialized).not.toContain("22222222-2222-4222-8222-222222222222");
    expect(serialized).not.toContain("filter");
    expect(serialized).not.toContain("hint");
    expect(serialized).not.toContain("details");
  });
});
