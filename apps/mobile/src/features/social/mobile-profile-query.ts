import type { UseQueryOptions } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export interface MobileProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function buildMobileProfileQueryOptions<
  TData = MobileProfileRow | null,
>({
  userId,
  select,
}: {
  userId: string | null;
  select?: (data: MobileProfileRow | null) => TData;
}): UseQueryOptions<MobileProfileRow | null, Error, TData> {
  return {
    queryKey: ["mobile-profile", userId] as const,
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .eq("id", userId ?? "")
        .maybeSingle();
      if (error) {
        throw error;
      }
      return (data ?? null) as MobileProfileRow | null;
    },
    select,
  };
}
