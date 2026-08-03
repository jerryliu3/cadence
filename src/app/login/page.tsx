import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to track your goals and keep your momentum."
      alternateText="New to Goalmaxxing?"
      alternateLabel="Create an account"
      alternateHref="/signup"
    >
      <LoginForm />
    </AuthShell>
  );
}
