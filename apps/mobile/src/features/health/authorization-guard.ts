export function isUnauthorizedHealthKitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /authorization not determined|authorization denied|not determined|not available for this device|HKErrorAuthorizationDenied|HKErrorAuthorizationNotDetermined|Code=4\b|Code=5\b/i.test(
    message
  );
}

export async function withHealthKitAuthorizationGuard<T>(
  read: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isUnauthorizedHealthKitError(error)) {
      return fallback;
    }
    throw error;
  }
}
