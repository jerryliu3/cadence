import * as Sentry from "@sentry/react-native";

let mobileSentryEnabled = false;
let mobileSentryInitialized = false;

function readOptionalDsnEnv() {
  const value = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? "";
  return value.length > 0 ? value : undefined;
}

function readOptionalEnvironmentEnv() {
  const value = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT?.trim() ?? "";
  return value.length > 0 ? value : undefined;
}

export function initMobileSentry() {
  if (mobileSentryInitialized) {
    return;
  }
  mobileSentryInitialized = true;

  const dsn = readOptionalDsnEnv();
  if (!dsn) {
    mobileSentryEnabled = false;
    return;
  }

  Sentry.init({
    dsn,
    environment: readOptionalEnvironmentEnv(),
  });
  mobileSentryEnabled = true;
}

export function isMobileSentryEnabled() {
  return mobileSentryEnabled;
}

export function addMobileSentryBreadcrumb(
  breadcrumb: Parameters<typeof Sentry.addBreadcrumb>[0]
) {
  if (!mobileSentryEnabled) {
    return;
  }
  Sentry.addBreadcrumb(breadcrumb);
}

export function captureMobileSentryMessage(
  message: string,
  captureContext?: Parameters<typeof Sentry.captureMessage>[1]
) {
  if (!mobileSentryEnabled) {
    return;
  }
  Sentry.captureMessage(message, captureContext);
}

export function captureMobileSentryException(
  error: unknown,
  captureContext?: Parameters<typeof Sentry.captureException>[1]
) {
  if (!mobileSentryEnabled) {
    return;
  }
  Sentry.captureException(error, captureContext);
}
