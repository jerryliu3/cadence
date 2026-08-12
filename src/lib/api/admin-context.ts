import { requireAuthenticatedRouteContext } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "moderator" | "admin";

export interface AdminContext {
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export async function requireAdminContext(
  minRole: AdminRole = "moderator"
): Promise<AdminContext | null> {
  const supabase = await createClient();
  const { userId } = await requireAuthenticatedRouteContext({
    supabase,
    unauthorizedMessage: "Sign in to continue.",
  });

  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin", {
    p_min_role: minRole,
  });

  if (error || !isAdmin) {
    return null;
  }

  return {
    userId,
    supabase,
  };
}
