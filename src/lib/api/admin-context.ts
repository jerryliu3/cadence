import { ApiRouteError, requireAuthenticatedRequestContext } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "moderator" | "admin";

export interface AdminContext {
  userId: string;
  supabase:
    | Awaited<ReturnType<typeof requireAuthenticatedRequestContext>>["supabase"]
    | Awaited<ReturnType<typeof createClient>>;
}

async function authorizeAdmin(
  authContext: { supabase: AdminContext["supabase"]; userId: string },
  minRole: AdminRole
): Promise<AdminContext | null> {
  const { data: isAdmin, error } = await authContext.supabase.rpc(
    "is_platform_admin",
    {
      p_min_role: minRole,
    }
  );

  if (error || !isAdmin) {
    return null;
  }

  return {
    userId: authContext.userId,
    supabase: authContext.supabase,
  };
}

export async function requireAdminContext(
  request: Request,
  minRole: AdminRole = "moderator"
): Promise<AdminContext | null> {
  const authContext = await requireAuthenticatedRequestContext(request, {
    unauthorizedMessage: "Sign in to continue.",
  });
  return authorizeAdmin(authContext, minRole);
}

export async function requireAdminContextFromCookies(
  minRole: AdminRole = "moderator"
): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiRouteError(
      401,
      "authentication_required",
      "Sign in to continue."
    );
  }
  return authorizeAdmin({ supabase, userId: user.id }, minRole);
}
