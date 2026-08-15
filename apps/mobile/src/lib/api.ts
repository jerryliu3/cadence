import { createApiClient } from "@cadence/shared/api-client";
import { mobileEnv } from "../config/env";
import { supabase } from "./supabase";

export const api = createApiClient({
  baseUrl: mobileEnv.apiBaseUrl,
  credentials: "omit",
  getAuthHeaders: async (): Promise<HeadersInit> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return {};
    }
    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  },
  onUnauthorized: async () => {
    const { data, error } = await supabase.auth.refreshSession();
    return Boolean(!error && data.session?.access_token);
  },
});
