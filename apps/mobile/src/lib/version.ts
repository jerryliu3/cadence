const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function parseXyz(version: string): [number, number, number] | null {
  const match = version.trim().match(VERSION_PATTERN);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isAppVersionBelowFloor(
  currentVersion: string | null | undefined,
  minSupportedAppVersion: string | null
) {
  if (!minSupportedAppVersion) {
    return false;
  }
  const floor = parseXyz(minSupportedAppVersion);
  if (!floor) {
    return false;
  }
  const current = currentVersion ? parseXyz(currentVersion) : null;
  if (!current) {
    return true;
  }
  return (
    current[0] - floor[0] || current[1] - floor[1] || current[2] - floor[2]
  ) < 0;
}
