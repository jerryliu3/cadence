import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentryModule = vi.hoisted(() => ({
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@sentry/react-native", () => sentryModule);

async function loadSentryModule() {
  return import("./sentry");
}

describe("mobile sentry", () => {
  beforeEach(() => {
    vi.resetModules();
    sentryModule.init.mockReset();
    sentryModule.addBreadcrumb.mockReset();
    sentryModule.captureMessage.mockReset();
    sentryModule.captureException.mockReset();
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
  });

  it("does not initialize or capture when DSN is absent", async () => {
    const sentry = await loadSentryModule();

    sentry.initMobileSentry();
    sentry.captureMobileSentryMessage("duo.scope_viewed", { level: "info" });
    sentry.captureMobileSentryException(new Error("boom"));
    sentry.addMobileSentryBreadcrumb({ category: "duo", message: "scope_viewed" });

    expect(sentryModule.init).not.toHaveBeenCalled();
    expect(sentryModule.captureMessage).not.toHaveBeenCalled();
    expect(sentryModule.captureException).not.toHaveBeenCalled();
    expect(sentryModule.addBreadcrumb).not.toHaveBeenCalled();
    expect(sentry.isMobileSentryEnabled()).toBe(false);
  });

  it("initializes with optional environment when DSN is present", async () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://dsn.example/1";
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = "preview";
    const sentry = await loadSentryModule();

    sentry.initMobileSentry();

    expect(sentryModule.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://dsn.example/1",
        environment: "preview",
      })
    );
    expect(sentry.isMobileSentryEnabled()).toBe(true);
  });
});
