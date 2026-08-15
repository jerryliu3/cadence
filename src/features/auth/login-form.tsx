"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSafePostLoginPath } from "@/lib/auth/login-redirect";
import { createClient } from "@/lib/supabase/client";

function parseAuthErrorMessage(error: unknown): string {
  const fallbackMessage = "Sign in failed. Please try again.";

  if (error instanceof Error) {
    const message = error.message?.trim();
    if (!message || message === "{}") {
      return fallbackMessage;
    }

    if (message.startsWith("{") && message.endsWith("}")) {
      try {
        const parsed = JSON.parse(message) as { message?: unknown };
        if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
          return parsed.message;
        }
      } catch {
        // Keep the original message when it's not valid JSON.
      }
    }

    if (message.toLowerCase().includes("upstream server")) {
      return "Authentication is temporarily unavailable. Please try again in a few seconds.";
    }

    return message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return fallbackMessage;
}

export function LoginForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(parseAuthErrorMessage(error));
        return;
      }

      toast.success("Welcome back.");
      router.replace(resolveSafePostLoginPath(searchParams.get("next")));
      router.refresh();
    } catch (error) {
      console.error("Login failed", error);
      toast.error(parseAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowPassword((previous) => !previous)}
              className="text-muted-foreground hover:underline"
              aria-pressed={showPassword}
            >
              {showPassword ? "Hide password" : "Show password"}
            </button>
            <Link href="/reset-password" className="text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
