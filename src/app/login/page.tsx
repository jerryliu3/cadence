import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { JourneyBackdrop } from "@/components/journey/journey-backdrop.web";
import type { JourneyFeatureFlags } from "@/components/journey/types";
import { LoginForm } from "@/features/auth/login-form";
import { getFeatureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/app");
  }

  const flags = getFeatureFlags();
  const journeyFlags: JourneyFeatureFlags = {
    journeyEnabled: flags.journeyEnabled,
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {journeyFlags.journeyEnabled ? <JourneyBackdrop flags={journeyFlags} /> : null}
      <div className="relative z-10">
        <AuthShell
          title="Welcome back"
          description="Sign in to track your goals and keep your momentum."
          alternateText="New to Goalmaxxing?"
          alternateLabel="Create an account"
          alternateHref="/signup"
          backgroundClassName={
            journeyFlags.journeyEnabled ? "bg-background/30 backdrop-blur-[1px]" : undefined
          }
        >
          <LoginForm />
        </AuthShell>
      </div>
    </div>
  );
}
