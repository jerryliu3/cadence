"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { TabNav } from "@/components/navigation/tab-nav";
import { Button } from "@/components/ui/button";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen w-full justify-center px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex w-full max-w-5xl flex-col gap-4 md:gap-6">
        <header className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Goalmaxxing</h1>
            </div>
            <div className="flex items-center">
              <Button asChild size="sm" className="hidden md:inline-flex" title="New goal">
                <Link href="/goals/new" aria-label="New goals">
                  <Plus className="size-4" />
                  New goal
                </Link>
              </Button>
            </div>
          </div>
          <div className="mt-4 hidden md:block">
            <TabNav />
          </div>
        </header>

        <main className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      </div>

      <div className="md:hidden">
        <TabNav mobile />
      </div>
    </div>
  );
}
