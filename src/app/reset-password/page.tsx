import { AuthShell } from "@/components/auth/auth-shell";
import { JourneyBackdrop } from "@/components/journey/journey-backdrop.web";
import type { JourneyFeatureFlags } from "@/components/journey/types";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { getFeatureFlags } from "@/lib/feature-flags";

export default function ResetPasswordPage() {
  const flags = getFeatureFlags();
  const journeyFlags: JourneyFeatureFlags = {
    journeyEnabled: flags.journeyEnabled,
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {journeyFlags.journeyEnabled ? <JourneyBackdrop flags={journeyFlags} /> : null}
      <div className="relative z-10">
        <AuthShell
          title="Reset password"
          description="Use this flow to request a reset link or set a new password."
          alternateText="Remembered your password?"
          alternateLabel="Back to sign in"
          alternateHref="/login"
          backgroundClassName={
            journeyFlags.journeyEnabled ? "bg-background/30 backdrop-blur-[1px]" : undefined
          }
        >
          <ResetPasswordForm />
        </AuthShell>
      </div>
    </div>
  );
}
