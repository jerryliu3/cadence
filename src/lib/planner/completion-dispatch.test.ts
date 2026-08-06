import { describe, expect, it, vi } from "vitest";
import completionDispatchFixture from "../../../test/fixtures/planner-contracts/completion-dispatch.v1.json";
import { completionDispatchFixtureSchema } from "./contracts/fixture-schema";
import {
  executeCompletionDispatch,
  resolveCompletionDispatch,
} from "./completion-dispatch";

describe("completion dispatch bridge", () => {
  const fixture = completionDispatchFixtureSchema.parse(
    completionDispatchFixture
  );

  it.each(fixture.cases)("$id", (fixtureCase) => {
    expect(resolveCompletionDispatch(fixtureCase.input)).toEqual(
      fixtureCase.expected
    );
  });

  it("never routes a targeted recurring goal to legacy period semantics", () => {
    for (const fixtureCase of fixture.cases.filter(
      (candidate) => candidate.input.targetedRecurring
    )) {
      expect(resolveCompletionDispatch(fixtureCase.input).route).not.toBe(
        "legacy_period"
      );
    }
  });
});

describe("completion dispatch executor", () => {
  it("executes canonical exact-date mutation", async () => {
    const calls: Array<{ route: string; body: Record<string, unknown> }> = [];
    const fetcher = async (route: string, init?: RequestInit) => {
      calls.push({
        route,
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ schemaVersion: "1" }), {
        status: 200,
      });
    };

    const result = await executeCompletionDispatch({
      decision: {
        route: "canonical_exact_date",
        exactDateOnly: true,
        allowed: true,
        reason: "allowed",
      },
      desiredFactState: "present",
      goalId: "12000000-0000-4000-8000-000000000001",
      date: "2026-08-05",
      timezone: "UTC",
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      route: "canonical_exact_date",
      message: null,
    });
    expect(calls).toEqual([
      {
        route: "/api/completions/exact-date",
        body: {
          goalId: "12000000-0000-4000-8000-000000000001",
          date: "2026-08-05",
          desiredFactState: "present",
          timezone: "UTC",
        },
      },
    ]);
  });

  it("runs legacy period mutations through provided callbacks", async () => {
    const result = await executeCompletionDispatch({
      decision: {
        route: "legacy_period",
        exactDateOnly: false,
        allowed: true,
        reason: "legacy_period_semantics",
      },
      desiredFactState: "absent",
      goalId: "12000000-0000-4000-8000-000000000001",
      date: "2026-08-05",
      timezone: "UTC",
      legacyExecutor: {
        markPresent: async () => null,
        markAbsent: async () => "legacy mutation failed",
      },
    });

    expect(result).toEqual({
      ok: false,
      route: "legacy_period",
      message: "legacy mutation failed",
    });
  });

  it("returns timeout when exact-date mutation stalls", async () => {
    vi.useFakeTimers();
    try {
      const resultPromise = executeCompletionDispatch({
        decision: {
          route: "canonical_exact_date",
          exactDateOnly: true,
          allowed: true,
          reason: "allowed",
        },
        desiredFactState: "present",
        goalId: "12000000-0000-4000-8000-000000000001",
        date: "2026-08-05",
        timezone: "UTC",
        timeoutMs: 25,
        fetcher: ((_, init) => {
          const signal = init?.signal as AbortSignal | undefined;
          return new Promise<Response>((_, reject) => {
            if (signal?.aborted) {
              const abortError = new Error("Aborted");
              abortError.name = "AbortError";
              reject(abortError);
              return;
            }
            signal?.addEventListener("abort", () => {
              const abortError = new Error("Aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          });
        }) as typeof fetch,
      });

      await vi.advanceTimersByTimeAsync(30);

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        route: "canonical_exact_date",
        message: "The completion request timed out. Please try again.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns timeout when legacy mutations stall", async () => {
    vi.useFakeTimers();
    try {
      const resultPromise = executeCompletionDispatch({
        decision: {
          route: "legacy_period",
          exactDateOnly: false,
          allowed: true,
          reason: "legacy_period_semantics",
        },
        desiredFactState: "present",
        goalId: "12000000-0000-4000-8000-000000000001",
        date: "2026-08-05",
        timezone: "UTC",
        timeoutMs: 25,
        legacyExecutor: {
          markPresent: async () => new Promise<string | null>(() => undefined),
          markAbsent: async () => null,
        },
      });

      await vi.advanceTimersByTimeAsync(30);

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        route: "legacy_period",
        message: "The completion request timed out. Please try again.",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
