import { type Page } from "@playwright/test";
import {
  encodeSupabaseSessionCookie,
  resolveSupabaseAuthCookieName,
  type SupabaseSessionPayload,
} from "@/lib/supabase/auth-cookie";

const JOURNEY_INTRO_SEEN_KEY = "cadence.journey_intro_seen.v1";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_SUPABASE_ANON_KEY = "local-anon-key-not-configured";

interface AuthCredentials {
  email: string;
  password: string;
}

interface BootstrapAuthSessionOptions extends AuthCredentials {
  markJourneyIntroSeen?: boolean;
}

function resolvePlaywrightBaseUrl() {
  const port = process.env.PLAYWRIGHT_PORT ?? "3100";
  return process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
}

function resolveSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    DEFAULT_SUPABASE_ANON_KEY;
  return { supabaseUrl, supabaseAnonKey };
}

async function createSupabaseSession(
  page: Page,
  credentials: AuthCredentials
): Promise<SupabaseSessionPayload> {
  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseConfig();
  const response = await page.request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: supabaseAnonKey,
        "content-type": "application/json",
      },
      data: credentials,
    }
  );

  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to bootstrap auth session for ${credentials.email} (${response.status()}): ${errorBody}`
    );
  }

  return (await response.json()) as SupabaseSessionPayload;
}

export async function bootstrapAuthSession(
  page: Page,
  { email, password, markJourneyIntroSeen = false }: BootstrapAuthSessionOptions
) {
  const baseUrl = resolvePlaywrightBaseUrl();
  const { supabaseUrl } = resolveSupabaseConfig();
  const session = await createSupabaseSession(page, { email, password });

  await page.context().addCookies([
    {
      name: resolveSupabaseAuthCookieName(supabaseUrl),
      value: encodeSupabaseSessionCookie(session),
      url: baseUrl,
      httpOnly: false,
      secure: baseUrl.startsWith("https://"),
      sameSite: "Lax",
    },
  ]);

  if (markJourneyIntroSeen) {
    await page.goto("/");
    await page.evaluate((journeyIntroSeenKey) => {
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      window.localStorage.setItem(journeyIntroSeenKey, `${yyyy}-${mm}-${dd}`);
    }, JOURNEY_INTRO_SEEN_KEY);
  }

}
