export interface SupabaseSessionPayload {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: Record<string, unknown>;
  weak_password?: unknown;
  [key: string]: unknown;
}

export function resolveSupabaseAuthCookieName(supabaseUrl: string) {
  const hostname = new URL(supabaseUrl).hostname;
  const projectRef = hostname.split(".")[0] ?? hostname;
  return `sb-${projectRef}-auth-token`;
}

export function encodeSupabaseSessionCookie(session: SupabaseSessionPayload) {
  const payload = {
    ...session,
    weak_password: session.weak_password ?? null,
  };
  return `base64-${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}`;
}
