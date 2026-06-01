"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useSyncExternalStore, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

function isRecoveryFlow(hash: string) {
  return hash.includes("type=recovery");
}

function subscribeToHashChange(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getHashSnapshot() {
  return typeof window === "undefined" ? "" : window.location.hash ?? "";
}

export function ResetPasswordForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hashValue = useSyncExternalStore(
    subscribeToHashChange,
    getHashSnapshot,
    () => ""
  );
  const recoveryMode = isRecoveryFlow(hashValue);

  const sendResetLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      toast.error(error.message);
      setIsSubmitting(false);
      return;
    }

    toast.success("Reset instructions sent. Check your local Inbucket mailbox.");
    setIsSubmitting(false);
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      toast.error(error.message);
      setIsSubmitting(false);
      return;
    }

    toast.success("Password updated.");
    router.replace("/login");
    setIsSubmitting(false);
  };

  if (recoveryMode) {
    return (
      <form className="space-y-4" onSubmit={updatePassword}>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </div>
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Set new password"}
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={sendResetLink}>
      <div className="space-y-2">
        <Label htmlFor="reset-email">Account email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
