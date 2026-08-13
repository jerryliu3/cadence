import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import type { Database } from "@cadence/shared/supabase/database.types";
import { mobileEnv } from "../config/env";

export const supabase = createClient<Database>(
  mobileEnv.supabaseUrl,
  mobileEnv.supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
    return;
  }
  supabase.auth.stopAutoRefresh();
});
