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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url, planner_primary_tab")
    .eq("id", user.id)
    .maybeSingle();
  const plannerPrimaryTabPreference = normalizePlannerPrimaryTabPreference(
    profile?.planner_primary_tab
  );
  const profileDisplayName =
    typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
  const profileUsername =
    typeof profile?.username === "string" ? profile.username.trim() : "";
  const metadataDisplayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : "";
  const metadataUsername =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username.trim()
      : "";
  const viewerAvatarUrl =
    typeof profile?.avatar_url === "string" && profile.avatar_url.trim().length > 0
      ? profile.avatar_url.trim()
      : null;
  const emailLocalPart =
    typeof user.email === "string" && user.email.includes("@")
      ? user.email.split("@")[0]?.trim() ?? ""
      : "";
  const viewerLabel =
    profileDisplayName ||
    profileUsername ||
    metadataDisplayName ||
    metadataUsername ||
    emailLocalPart ||
    "You";
  const duo = await loadDuoContext({ supabase });
  const initialDuoScopePreference = parseDuoScopeCookieValue(
    cookieStore.get(DUO_SCOPE_COOKIE_NAME)?.value
  );

  return (
    <AppShell
      userId={user.id}
      viewerLabel={viewerLabel}
      goalSheet={goalSheet}
      duoState={duo.state}
      duoAvailability={duo.availability}
      initialDuoScopePreference={initialDuoScopePreference}
      plannerPrimaryTabPreference={plannerPrimaryTabPreference}
      viewerAvatarUrl={viewerAvatarUrl}
    >
      {children}
    </AppShell>
  );
}
