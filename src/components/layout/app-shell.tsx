"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, type ReactNode, ViewTransition } from "react";
import { TabNav } from "@/components/navigation/tab-nav";
import { Button } from "@/components/ui/button";
import { XpLevelBadge } from "@/components/xp/xp-level-badge";
import { XpRewardProvider } from "@/components/xp/xp-reward-provider";
import { DuoProvider } from "@/features/social/duo/duo-context";
import { DuoScopeToggle } from "@/features/social/duo/duo-scope-toggle";
import { setTabDataCacheScope } from "@/lib/cache/tab-data-cache";
import type { DuoAvailability, DuoContextState, DuoScope } from "@/lib/social/duo/types";

interface AppShellProps {
  children: ReactNode;
  userId: string;
  goalSheet?: ReactNode;
  duoState: DuoContextState;
  duoAvailability: DuoAvailability;
  initialDuoScopePreference: DuoScope | null;
}

export function AppShell({
  children,
  userId,
  goalSheet,
  duoState,
  duoAvailability,
  initialDuoScopePreference,
}: AppShellProps) {
  setTabDataCacheScope(userId);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const returnTo = search.length > 0 ? `${pathname}?${search}` : pathname;
  const newGoalHref = `/goals/new?returnTo=${encodeURIComponent(returnTo)}`;
  const mainContent = (
    <main className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">
      {children}
    </main>
  );
  const ViewTransitionWrapper =
    typeof ViewTransition === "function" ? ViewTransition : Fragment;

  return (
    <XpRewardProvider>
      <DuoProvider
        viewerUserId={userId}
        initialState={duoState}
        availability={duoAvailability}
        initialScopePreference={initialDuoScopePreference}
      >
        <div className="flex min-h-screen w-full justify-center px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex w-full max-w-5xl flex-col gap-4 md:gap-6">
            <header
              className="sticky top-0 z-40 -mx-4 -mt-4 border-b bg-background px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] shadow-sm md:static md:m-0 md:rounded-2xl md:border md:bg-card md:p-4"
              style={{ viewTransitionName: "app-shell-header" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">Goalmaxxing</h1>
                  <XpLevelBadge />
                </div>
                <div className="flex items-center gap-2">
                  <DuoScopeToggle />
                  <Button asChild size="sm" title="New Goal +">
                    <Link href={newGoalHref}>
                      New Goal +
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="mt-4 hidden md:block">
                <TabNav />
              </div>
            </header>

            {ViewTransitionWrapper === ViewTransition ? (
              <ViewTransition
                name="app-main-content"
                enter={{
                  "nav-forward": "app-nav-forward",
                  "nav-back": "app-nav-back",
                  default: "app-nav-crossfade",
                }}
                exit={{
                  "nav-forward": "app-nav-forward",
                  "nav-back": "app-nav-back",
                  default: "app-nav-crossfade",
                }}
                default="none"
              >
                {mainContent}
              </ViewTransition>
            ) : (
              <ViewTransitionWrapper>{mainContent}</ViewTransitionWrapper>
            )}
          </div>
        </div>
        <div className="md:hidden">
          <TabNav mobile />
        </div>
        {goalSheet}
      </DuoProvider>
    </XpRewardProvider>
  );
}
