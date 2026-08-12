"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { TabNav } from "@/components/navigation/tab-nav";
import { Button } from "@/components/ui/button";
import { XpLevelBadge } from "@/components/xp/xp-level-badge";
import { setTabDataCacheScope } from "@/lib/cache/tab-data-cache";

interface AppShellProps {
  children: ReactNode;
  userId: string;
  goalSheet?: ReactNode;
}

export function AppShell({ children, userId, goalSheet }: AppShellProps) {
  setTabDataCacheScope(userId);
  return (
    <div className="flex min-h-screen w-full justify-center px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex w-full max-w-5xl flex-col gap-4 md:gap-6">
        <header className="sticky top-0 z-40 -mx-4 -mt-4 border-b bg-background px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] shadow-sm md:static md:m-0 md:rounded-2xl md:border md:bg-card md:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Goalmaxxing</h1>
              <XpLevelBadge />
            </div>
            <div className="flex items-center">
              <Button asChild size="sm" title="New Goal +">
                <Link href="/goals/new">
                  New Goal +
                </Link>
              </Button>
            </div>
          </div>
          <div className="mt-4 hidden md:block">
            <TabNav />
          </div>
        </header>

        <main className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>

      <div className="md:hidden">
        <TabNav mobile />
      </div>
      {goalSheet}
    </div>
  );
}
