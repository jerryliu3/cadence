import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertEnvAtBoot,
  getPublicEnv,
  getServerEnv,
  resetEnvCacheForTests,
} from "./env";

describe("env schema", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("parses public env with optional fields", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    resetEnvCacheForTests();
    expect(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(
      "http://127.0.0.1:54321"
    );
  });

  it("rejects mistyped public URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    resetEnvCacheForTests();
    expect(() => getPublicEnv()).toThrow(/Invalid public environment/);
  });

  it("rejects mistyped boolean feature flags", () => {
    vi.stubEnv("FEATURE_CROSS_MONTH_MOVES", "sometimes");
    resetEnvCacheForTests();
    expect(() => getServerEnv()).toThrow(/Invalid server environment/);
  });

  it("defaults feature flags conservatively", () => {
    resetEnvCacheForTests();
    const env = getServerEnv();
    expect(env.FEATURE_CROSS_MONTH_MOVES).toBe(false);
    expect(env.XP_ENABLED).toBe(false);
    expect(env.SOCIAL_ENABLED).toBe(false);
    expect(env.INTEGRATIONS_ENABLED).toBe(false);
    expect(env.JOURNEY_ENABLED).toBe(false);
    expect(env.INTEGRATIONS_ROLLOUT_STAGE).toBe("off");
  });

  it("requires core secrets in hosted production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("CRON_SECRET", "");
    resetEnvCacheForTests();
    expect(() => assertEnvAtBoot()).toThrow(/Missing required production/);
  });

  it("does not require cron secret for local next start production builds", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    vi.stubEnv("CRON_SECRET", "");
    resetEnvCacheForTests();
    expect(() => assertEnvAtBoot()).not.toThrow();
  });

  it("passes hosted production boot when core vars are present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    resetEnvCacheForTests();
    expect(() => assertEnvAtBoot()).not.toThrow();
  });
});
