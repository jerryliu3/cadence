import { z } from "zod";

/**
 * Validated process.env access.
 *
 * - `getPublicEnv()` is safe for client and server.
 * - `getServerEnv()` is server-only (secrets); call from route handlers / Node instrumentation.
 * - `assertEnvAtBoot()` runs from `instrumentation.ts` and fails the process loudly when
 *   production is missing required configuration (instead of 500-ing on first request).
 */

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const optionalNonEmptyString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional()
);

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (typeof value !== "string") {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "") {
      return defaultValue;
    }
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
    return value;
  }, z.boolean());

const optionalPositiveInt = ({
  min,
  max,
}: {
  min: number;
  max: number;
}) =>
  z.preprocess((value) => {
    const normalized = emptyToUndefined(value);
    if (normalized === undefined) {
      return undefined;
    }
    if (typeof normalized !== "string") {
      return normalized;
    }
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : normalized;
  }, z.number().int().min(min).max(max).optional());

const publicEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalNonEmptyString,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalNonEmptyString,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalNonEmptyString,
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: optionalNonEmptyString,
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: optionalNonEmptyString,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString,
  VAPID_PRIVATE_KEY: optionalNonEmptyString,
  VAPID_SUBJECT: optionalNonEmptyString,
  CRON_SECRET: optionalNonEmptyString,
  GEMINI_API_KEY: optionalNonEmptyString,
  GEMINI_MODEL: optionalNonEmptyString,
  GEMINI_FALLBACK_MODELS: optionalNonEmptyString,
  SENTRY_ORG: optionalNonEmptyString,
  SENTRY_PROJECT: optionalNonEmptyString,
  SENTRY_AUTH_TOKEN: optionalNonEmptyString,
  FEATURE_CROSS_MONTH_MOVES: booleanFromEnv(false),
  XP_ENABLED: booleanFromEnv(false),
  SOCIAL_ENABLED: booleanFromEnv(false),
  INTEGRATIONS_ENABLED: booleanFromEnv(false),
  CALENDAR_COACH_DISABLE_QUOTA: booleanFromEnv(false),
  CALENDAR_COACH_TIMEOUT_MS: optionalPositiveInt({
    min: 10_000,
    max: 60_000,
  }),
  CALENDAR_COACH_DAILY_LIMIT: optionalPositiveInt({ min: 1, max: 1_000_000 }),
  CALENDAR_BULK_PARSER_DAILY_LIMIT: optionalPositiveInt({
    min: 1,
    max: 1_000_000,
  }),
  PLANNER_TELEMETRY_HMAC_KEY: optionalNonEmptyString,
  PLANNER_TELEMETRY_HMAC_KEY_VERSION: optionalNonEmptyString,
  CALENDAR_TELEMETRY_COHORT: optionalNonEmptyString,
  CALENDAR_FEED_HMAC_KEY: optionalNonEmptyString,
  INTEGRATIONS_TOKEN_ENCRYPTION_KEY: optionalNonEmptyString,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function readPublicEnvInput() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  };
}

function readServerEnvInput() {
  return {
    ...readPublicEnvInput(),
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    CRON_SECRET: process.env.CRON_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_FALLBACK_MODELS: process.env.GEMINI_FALLBACK_MODELS,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    FEATURE_CROSS_MONTH_MOVES: process.env.FEATURE_CROSS_MONTH_MOVES,
    XP_ENABLED: process.env.XP_ENABLED,
    SOCIAL_ENABLED: process.env.SOCIAL_ENABLED,
    INTEGRATIONS_ENABLED: process.env.INTEGRATIONS_ENABLED,
    CALENDAR_COACH_DISABLE_QUOTA: process.env.CALENDAR_COACH_DISABLE_QUOTA,
    CALENDAR_COACH_TIMEOUT_MS: process.env.CALENDAR_COACH_TIMEOUT_MS,
    CALENDAR_COACH_DAILY_LIMIT: process.env.CALENDAR_COACH_DAILY_LIMIT,
    CALENDAR_BULK_PARSER_DAILY_LIMIT:
      process.env.CALENDAR_BULK_PARSER_DAILY_LIMIT,
    PLANNER_TELEMETRY_HMAC_KEY: process.env.PLANNER_TELEMETRY_HMAC_KEY,
    PLANNER_TELEMETRY_HMAC_KEY_VERSION:
      process.env.PLANNER_TELEMETRY_HMAC_KEY_VERSION,
    CALENDAR_TELEMETRY_COHORT: process.env.CALENDAR_TELEMETRY_COHORT,
    CALENDAR_FEED_HMAC_KEY: process.env.CALENDAR_FEED_HMAC_KEY,
    INTEGRATIONS_TOKEN_ENCRYPTION_KEY:
      process.env.INTEGRATIONS_TOKEN_ENCRYPTION_KEY,
  };
}

let cachedPublicEnv: PublicEnv | null = null;
let cachedServerEnv: ServerEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) {
    return cachedPublicEnv;
  }
  const parsed = publicEnvSchema.safeParse(readPublicEnvInput());
  if (!parsed.success) {
    throw new Error(`Invalid public environment: ${formatZodError(parsed.error)}`);
  }
  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }
  const parsed = serverEnvSchema.safeParse(readServerEnvInput());
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${formatZodError(parsed.error)}`);
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export function resetEnvCacheForTests() {
  cachedPublicEnv = null;
  cachedServerEnv = null;
}

function isHostedProductionRuntime() {
  // `next start` (including Playwright CI) sets NODE_ENV=production without being
  // a hosted production deploy. Gate boot-time required secrets on Vercel prod only.
  return process.env.VERCEL_ENV === "production";
}

/**
 * Fail fast in hosted production when core secrets/config are missing or mistyped.
 * Local/dev/CI keep optional fields optional so `next start` smoke stays usable.
 */
export function assertEnvAtBoot() {
  const env = getServerEnv();
  if (!isHostedProductionRuntime()) {
    return env;
  }

  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (
    !env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    missing.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }
  if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!env.CRON_SECRET) {
    missing.push("CRON_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`
    );
  }

  return env;
}

export function getSupabaseAnonKey(env: PublicEnv = getPublicEnv()) {
  return (
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getSupabaseSecretKey(env: ServerEnv = getServerEnv()) {
  return env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
}
