import { createClient } from "@supabase/supabase-js";
import { getServerEnv, getSupabaseSecretKey } from "@/lib/env";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export function createAdminClient() {
  const env = getServerEnv();
  const secretKey = getSupabaseSecretKey(env);

  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required for server-side Supabase admin operations."
    );
  }

  const { supabaseUrl } = getSupabaseConfig();

  return createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
