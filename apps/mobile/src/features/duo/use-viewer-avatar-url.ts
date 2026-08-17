import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../lib/session";
import { buildMobileProfileQueryOptions } from "../social/mobile-profile-query";

export function useViewerAvatarUrl() {
  const { userId } = useSession();
  return useQuery({
    ...buildMobileProfileQueryOptions({
      userId,
      select: (profile) => {
        const avatarUrl = profile?.avatar_url;
        return typeof avatarUrl === "string" && avatarUrl.trim().length > 0
          ? avatarUrl.trim()
          : null;
      },
    }),
    staleTime: 0,
  });
}
