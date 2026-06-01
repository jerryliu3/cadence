import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Reset password"
      description="Use this flow to request a reset link or set a new password."
      alternateText="Remembered your password?"
      alternateLabel="Back to sign in"
      alternateHref="/login"
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
