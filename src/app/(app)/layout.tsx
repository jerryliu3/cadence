import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { normalizePlannerPrimaryTabPreference } from "@cadence/shared/navigation/tabs";
import { AppShell } from "@/components/layout/app-shell";
import { parseDuoScopeCookieValue, DUO_SCOPE_COOKIE_NAME } from "@/lib/social/duo/scope-cookie";
import { loadDuoContext } from "@/lib/social/duo/load-duo-context";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({
  children,
  goalSheet,
}: {
  children: ReactNode;
  goalSheet?: ReactNode;
}) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profilePreferences } = await supabase
    .from("profiles")
    .select("planner_primary_tab")
    .eq("id", user.id)
    .maybeSingle();

  const plannerPrimaryTabPreference = normalizePlannerPrimaryTabPreference(
    profilePreferences?.planner_primary_tab
  );
  const duo = await loadDuoContext({ supabase });
  const initialDuoScopePreference = parseDuoScopeCookieValue(
    cookieStore.get(DUO_SCOPE_COOKIE_NAME)?.value
  );

  return (
    <AppShell
      userId={user.id}
      goalSheet={goalSheet}
      duoState={duo.state}
      duoAvailability={duo.availability}
      initialDuoScopePreference={initialDuoScopePreference}
      plannerPrimaryTabPreference={plannerPrimaryTabPreference}
    >
      {children}
    </AppShell>
  );
}
