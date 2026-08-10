import { getPublicEnv, getSupabaseAnonKey } from "@/lib/env";

const fallbackSupabaseUrl = "http://127.0.0.1:54321";
const fallbackSupabaseAnonKey = "local-anon-key-not-configured";

export function getSupabaseConfig() {
  const env = getPublicEnv();
  const clientKey = getSupabaseAnonKey(env) ?? fallbackSupabaseAnonKey;

  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? fallbackSupabaseUrl,
    supabaseAnonKey: clientKey,
  };
}
