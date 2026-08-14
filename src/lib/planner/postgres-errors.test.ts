import { describe, expect, it } from "vitest";
import {
  normalizePostgresErrorMessage,
  postgresErrorCodeIs,
  postgresErrorMatches,
} from "@/lib/planner/postgres-errors";

describe("postgres error matching", () => {
  it("matches a raised planner error on code and message", () => {
    expect(
      postgresErrorMatches(
        { code: "P0001", message: "stale_schedule" },
        "P0001",
        "stale_schedule"
      )
    ).toBe(true);
  });

  it("tolerates casing and surrounding whitespace on both sides", () => {
    expect(
      postgresErrorMatches(
        { code: " p0001 ", message: "  STALE_SCHEDULE  " },
        "P0001",
        "stale_schedule"
      )
    ).toBe(true);
  });

  it("does not match when the message differs", () => {
    expect(
      postgresErrorMatches(
        { code: "P0001", message: "schedule_conflict" },
        "P0001",
        "stale_schedule"
      )
    ).toBe(false);
  });

  it("does not match when the code differs", () => {
    expect(
      postgresErrorMatches(
        { code: "22023", message: "stale_schedule" },
        "P0001",
        "stale_schedule"
      )
    ).toBe(false);
  });

  it("treats missing code and message as non-matching rather than throwing", () => {
    expect(postgresErrorMatches({}, "P0001", "stale_schedule")).toBe(false);
    expect(
      postgresErrorMatches({ code: null, message: null }, "P0001", "stale_schedule")
    ).toBe(false);
    expect(normalizePostgresErrorMessage({})).toBe("");
  });

  it("does not substring-match a longer message", () => {
    expect(
      postgresErrorMatches(
        { code: "P0001", message: "stale_schedule_detected" },
        "P0001",
        "stale_schedule"
      )
    ).toBe(false);
  });

  it("checks codes independently of the message", () => {
    expect(postgresErrorCodeIs({ code: "23505" }, "23505")).toBe(true);
    expect(postgresErrorCodeIs({ code: "23505" }, "P0001")).toBe(false);
  });
});
