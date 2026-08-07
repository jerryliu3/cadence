const DEFAULT_REFRESH_TIMEOUT_MS = 15_000;

export async function withPlannerRefreshTimeout<T>({
  operation,
  timeoutMs = DEFAULT_REFRESH_TIMEOUT_MS,
  timeoutMessage,
}: {
  operation: Promise<T>;
  timeoutMs?: number;
  timeoutMessage: string;
}): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
