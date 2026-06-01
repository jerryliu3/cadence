"use client";

import { format } from "date-fns";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { TabNav } from "@/components/navigation/tab-nav";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface AppShellProps {
  children: ReactNode;
  userEmail: string;
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
    setIsSigningOut(false);
  };

  return (
    <div className="flex min-h-screen w-full justify-center px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex w-full max-w-5xl flex-col gap-4 md:gap-6">
        <header className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {format(new Date(), "EEEE, MMM d")}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">Cadence</h1>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={signOut}
              disabled={isSigningOut}
            >
              <LogOut className="size-4" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
          <div className="mt-4 hidden md:block">
            <TabNav />
          </div>
        </header>

        <main className="pb-20 md:pb-0">{children}</main>
      </div>

      <div className="md:hidden">
        <TabNav mobile />
      </div>
    </div>
  );
}
