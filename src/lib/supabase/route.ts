import { createClient as createTokenClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { readBearerToken } from "@/lib/supabase/auth-header";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export async function createRouteClient(request: Request) {
  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return {
      supabase: await createCookieClient(),
      accessToken: null,
    };
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  const supabase = createTokenClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return {
    supabase,
    accessToken,
  };
}
