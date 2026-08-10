import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Fail loud on mistyped/missing production env before serving traffic.
  const { assertEnvAtBoot } = await import("@/lib/env");
  assertEnvAtBoot();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
