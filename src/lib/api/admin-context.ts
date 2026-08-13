import { requireAuthenticatedRequestContext } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "moderator" | "admin";

export interface AdminContext {
  userId: string;
  supabase:
    | Awaited<ReturnType<typeof requireAuthenticatedRequestContext>>["supabase"]
    | Awaited<ReturnType<typeof createClient>>;
}

export async function requireAdminContext(
  requestOrRole: Request | AdminRole | null = null,
  minRole: AdminRole = "moderator"
): Promise<AdminContext | null> {
  const request =
    requestOrRole instanceof Request ? requestOrRole : null;
  const role = typeof requestOrRole === "string" ? requestOrRole : minRole;
  const authContext = request
    ? await requireAuthenticatedRequestContext(request, {
        unauthorizedMessage: "Sign in to continue.",
      })
    : await (async () => {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          return null;
        }
        return {
          supabase,
          userId: user.id,
        };
      })();
  if (!authContext) {
    return null;
  }
  const { supabase, userId } = authContext;

  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin", {
    p_min_role: role,
  });

  if (error || !isAdmin) {
    return null;
  }

  return {
    userId,
    supabase,
  };
}
