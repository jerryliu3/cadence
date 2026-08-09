import { randomUUID } from "node:crypto";
import { RouteError } from "@/lib/api/errors";

export interface AuthenticatedUserResult {
  userId: string;
}

interface SupabaseAuthClientLike {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
}

export function createCorrelationId() {
  return randomUUID();
}

export async function requireAuthenticatedUser(
  supabase: SupabaseAuthClientLike,
  {
    code = "authentication_required",
    message = "Sign in to continue.",
  }: {
    code?: string;
    message?: string;
  } = {}
): Promise<AuthenticatedUserResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new RouteError(401, code, message);
  }

  return { userId: user.id };
}
