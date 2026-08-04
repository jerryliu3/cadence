import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export function createAdminClient() {
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ??
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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
