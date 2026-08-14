export function isUnauthorizedHealthKitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /authoriz|not determined|HKErrorDomain|not available for this device/i.test(
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
