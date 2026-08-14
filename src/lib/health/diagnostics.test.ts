import { afterEach, describe, expect, it, vi } from "vitest";

const sentryModule = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryModule);

import { reportHealthDiagnostic } from "./diagnostics";

describe("health diagnostics", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    sentryModule.addBreadcrumb.mockReset();
    sentryModule.captureMessage.mockReset();
  });

  it("no-ops without a Sentry DSN", () => {
    reportHealthDiagnostic({
      event: "ingest",
      correlationId: "cid",
      provider: "apple_healthkit",
      ingestedCount: 3,
    });
    expect(sentryModule.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("records ingest breadcrumbs without raw health values", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://dsn.example/1";
    reportHealthDiagnostic({
      event: "ingest",
      correlationId: "cid",
      provider: "apple_healthkit",
      ingestedCount: 3,
      canonicalCount: 2,
      suppressedCount: 1,
      autocompleteAppliedCount: 0,
    });
    expect(sentryModule.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "health",
        message: "ingest",
        data: expect.objectContaining({
          ingestedCount: 3,
          canonicalCount: 2,
          suppressedCount: 1,
        }),
      })
    );
    const data = sentryModule.addBreadcrumb.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(data)).not.toMatch(/value_numeric|kcal|heart/i);
    expect(sentryModule.captureMessage).not.toHaveBeenCalled();
  });

  it("captures disconnect and sync failures", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://dsn.example/1";
    reportHealthDiagnostic({
      event: "disconnect",
      correlationId: "cid",
      provider: "android_health_connect",
      deletedCount: 4,
      recomputedDays: 2,
    });
    expect(sentryModule.captureMessage).toHaveBeenCalledWith(
      "health.disconnect",
      expect.objectContaining({
        tags: expect.objectContaining({ area: "health" }),
      })
    );
  });
});
