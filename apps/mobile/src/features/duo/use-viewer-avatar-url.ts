import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../lib/session";
import { supabase } from "../../lib/supabase";

export function useViewerAvatarUrl() {
  const { userId } = useSession();
  return useQuery({
    queryKey: ["mobile-duo-viewer-avatar", userId ?? "anonymous"],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) {
        return null;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      const avatarUrl = data?.avatar_url;
      return typeof avatarUrl === "string" && avatarUrl.trim().length > 0
        ? avatarUrl.trim()
        : null;
    },
    staleTime: 60_000,
  });
}
