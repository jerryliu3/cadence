"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthRedirectBaseUrl } from "@/lib/supabase/public-app-url";

type UsernameAvailability =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "error";

const usernamePattern = /^[a-z0-9_]+$/;

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function isValidUsername(value: string) {
  return (
    value.length >= 3 &&
    value.length <= 32 &&
    usernamePattern.test(value)
  );
}

export function SignupForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameStatus, setUsernameStatus] =
    useState<UsernameAvailability>("idle");

  const checkUsernameAvailability = useCallback(
    async (candidate: string): Promise<UsernameAvailability> => {
      const normalized = normalizeUsername(candidate);

      if (!isValidUsername(normalized)) {
        setUsernameStatus("invalid");
        return "invalid";
      }

      setUsernameStatus("checking");
      const { data, error } = await supabase.rpc("username_is_available", {
        p_username: normalized,
      });

      if (error) {
        setUsernameStatus("error");
        return "error";
      }

      if (!data) {
        setUsernameStatus("taken");
        return "taken";
      }

      setUsernameStatus("available");
      return "available";
    },
    [supabase]
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUsername = normalizeUsername(username);
    setUsername(normalizedUsername);

    if (!isValidUsername(normalizedUsername)) {
      setUsernameStatus("invalid");
      toast.error(
        "Username must be 3-32 characters and use lowercase letters, numbers, or underscores."
      );
      return;
    }

    setIsSubmitting(true);
    const availability = await checkUsernameAvailability(normalizedUsername);
    if (availability !== "available") {
      if (availability === "taken") {
        toast.error("That username is already taken.");
      } else if (availability === "error") {
        toast.error("Unable to verify username right now. Please try again.");
      }
      setIsSubmitting(false);
      return;
    }

    const appBaseUrl = resolveAuthRedirectBaseUrl(
      process.env.NEXT_PUBLIC_APP_URL,
      window.location.origin
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appBaseUrl}/login`,
        data: {
          username: normalizedUsername,
          display_name: displayName || normalizedUsername,
        },
      },
    });

    if (error) {
      toast.error(error.message);
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      toast.success("Account created.");
      router.replace("/");
      router.refresh();
    } else {
      toast.success("Account created. Check your email to confirm if required.");
      router.replace("/login");
    }

    setIsSubmitting(false);
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(event) => {
            setUsername(normalizeUsername(event.target.value));
            setUsernameStatus("idle");
          }}
          onBlur={() => {
            if (!username) {
              return;
            }
            void checkUsernameAvailability(username);
          }}
          placeholder="yourname"
          minLength={3}
          maxLength={32}
          pattern="[a-z0-9_]+"
          required
        />
        {usernameStatus === "checking" ? (
          <p className="text-xs text-muted-foreground">Checking username availability...</p>
        ) : null}
        {usernameStatus === "available" ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Username is available.
          </p>
        ) : null}
        {usernameStatus === "taken" ? (
          <p className="text-xs text-destructive">That username is already taken.</p>
        ) : null}
        {usernameStatus === "invalid" ? (
          <p className="text-xs text-destructive">
            Use 3-32 lowercase letters, numbers, or underscores.
          </p>
        ) : null}
        {usernameStatus === "error" ? (
          <p className="text-xs text-destructive">
            Could not check availability. Try again.
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
      </div>
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
