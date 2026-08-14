import { describe, expect, it } from "vitest";
import { assertQueriesOk, SupabaseQueryError } from "@/lib/supabase/query-error";

describe("assertQueriesOk", () => {
  it("passes when every response succeeded", () => {
    expect(() =>
      assertQueriesOk([{ error: null }, { error: null }], "boom")
    ).not.toThrow();
  });

  it("throws on the first failed response so callers cannot render an empty lane", () => {
    let thrown: unknown;
    try {
      assertQueriesOk(
        [{ error: null }, { error: { message: "permission denied" } }],
        "Checklist goals could not be loaded."
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SupabaseQueryError);
    expect((thrown as SupabaseQueryError).message).toBe(
      "Checklist goals could not be loaded."
    );
    expect((thrown as SupabaseQueryError).cause).toEqual({
      message: "permission denied",
    });
  });

  it("does not treat an empty data set as a failure", () => {
    expect(() =>
      assertQueriesOk([{ error: null }], "should not throw")
    ).not.toThrow();
  });
});
