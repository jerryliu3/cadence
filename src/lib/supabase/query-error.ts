export class SupabaseQueryError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SupabaseQueryError";
    this.cause = cause;
  }
}

/**
 * PostgREST resolves with `{ data: null, error }` instead of rejecting, so the
 * common `response.data ?? []` idiom turns a failed read into an empty result.
 * On a duo partner lane that renders as "your partner has no goals" rather than
 * an error, which is a plausible-looking lie and bypasses the failClosed path.
 *
 * Throw instead, so the caller's existing catch (failClosed / telemetry / toast)
 * handles it the same way it already handles fetchProgressContext failures.
 */
export function assertQueriesOk(
  responses: ReadonlyArray<{ error: { message: string } | null }>,
  message: string
): void {
  const failed = responses.find((response) => response.error !== null);
  if (failed?.error) {
    throw new SupabaseQueryError(message, failed.error);
  }
}
