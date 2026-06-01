const fallbackSupabaseUrl = "http://127.0.0.1:54321";
const fallbackSupabaseAnonKey = "local-anon-key-not-configured";

export function getSupabaseConfig() {
  const clientKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    fallbackSupabaseAnonKey;

  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? fallbackSupabaseUrl,
    supabaseAnonKey: clientKey,
  };
}
