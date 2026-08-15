export class MobileSupabaseQueryError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "MobileSupabaseQueryError";
    this.code = code;
  }
}

function extractCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const candidate = (error as { code?: unknown }).code;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

export function sanitizeMobileSupabaseError({
  error,
  userMessage,
}: {
  error: unknown;
  userMessage: string;
}): MobileSupabaseQueryError {
  return new MobileSupabaseQueryError(userMessage, extractCode(error));
}
