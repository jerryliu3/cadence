const localhostHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function isLocalhostHost(hostname: string) {
  return localhostHosts.has(hostname.toLowerCase());
}

export function resolveAuthRedirectBaseUrl(
  configuredAppUrl: string | undefined,
  browserOrigin: string
) {
  const fallbackOrigin = trimTrailingSlashes(browserOrigin);
  const configuredValue = configuredAppUrl?.trim();

  if (!configuredValue) {
    return fallbackOrigin;
  }

  try {
    const configuredUrl = new URL(configuredValue);
    const browserUrl = new URL(browserOrigin);

    if (isLocalhostHost(configuredUrl.hostname) && !isLocalhostHost(browserUrl.hostname)) {
      return fallbackOrigin;
    }

    return trimTrailingSlashes(configuredUrl.origin);
  } catch {
    return fallbackOrigin;
  }
}
