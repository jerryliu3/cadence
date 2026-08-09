export interface PostgresErrorLike {
  code?: string | null;
  message?: string | null;
}

export function normalizePostgresErrorMessage(error: PostgresErrorLike) {
  return (error.message ?? "").trim().toLowerCase();
}

export function postgresErrorCodeIs(
  error: PostgresErrorLike,
  code: string
) {
  return (error.code ?? "").trim().toUpperCase() === code.trim().toUpperCase();
}

export function postgresErrorMatches(
  error: PostgresErrorLike,
  code: string,
  messageCode: string
) {
  return (
    postgresErrorCodeIs(error, code) &&
    normalizePostgresErrorMessage(error) === messageCode.trim().toLowerCase()
  );
}
