export function isAppVersionBelowFloor(
  currentVersion: string,
  minSupportedAppVersion: string | null
) {
  if (!minSupportedAppVersion) {
    return false;
  }
  const current = currentVersion.split(".").map((part) => Number(part) || 0);
  const floor = minSupportedAppVersion.split(".").map((part) => Number(part) || 0);
  const length = Math.max(current.length, floor.length);
  for (let index = 0; index < length; index += 1) {
    const left = current[index] ?? 0;
    const right = floor[index] ?? 0;
    if (left < right) {
      return true;
    }
    if (left > right) {
      return false;
    }
  }
  return false;
}
