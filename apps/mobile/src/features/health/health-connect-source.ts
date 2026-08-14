export function resolveHealthConnectSourceIdentifier(input: {
  dataOrigin?: string | { packageName?: string } | null;
  currentDeviceSpn?: string | null;
}): string {
  const packageName =
    typeof input.dataOrigin === "string"
      ? input.dataOrigin.trim()
      : input.dataOrigin?.packageName?.trim() ?? "";

  if (packageName.length > 0) {
    return packageName;
  }

  const spn = input.currentDeviceSpn?.trim();
  if (spn) {
    return spn;
  }

  return "unknown.health.connect";
}

export function isOnDeviceHealthConnectOrigin(
  packageName: string,
  currentDeviceSpn: string | null
): boolean {
  return packageName === "android" || packageName === currentDeviceSpn;
}
