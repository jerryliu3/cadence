"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, type ReactNode, ViewTransition } from "react";
import { JourneyIntroOverlay } from "@/components/intro/journey-intro-overlay";
import { TabNav } from "@/components/navigation/tab-nav";
import { Button } from "@/components/ui/button";
import { AltitudeBackdrop } from "@/components/xp/altitude-backdrop";
import { XpProfileProvider } from "@/components/xp/xp-profile-provider";
import { XpProgressBar } from "@/components/xp/xp-progress-bar";
import { XpRewardProvider } from "@/components/xp/xp-reward-provider";
import { DuoProvider } from "@/features/social/duo/duo-context";
import { DuoScopeToggle } from "@/features/social/duo/duo-scope-toggle";
import { setTabDataCacheScope } from "@/lib/cache/tab-data-cache";
import type {
  DuoAvailability,
  DuoContextState,
  DuoScope,
} from "@cadence/shared/social/duo";
import type { PlannerPrimaryTabPreference } from "@cadence/shared/navigation/tabs";

interface AppShellProps {
  children: ReactNode;
  userId: string;
  viewerLabel?: string | null;
  goalSheet?: ReactNode;
  duoState: DuoContextState;
  duoAvailability: DuoAvailability;
  initialDuoScopePreference: DuoScope | null;
  plannerPrimaryTabPreference: PlannerPrimaryTabPreference;
}

export function AppShell({
  children,
  userId,
  viewerLabel,
  goalSheet,
  duoState,
  duoAvailability,
  initialDuoScopePreference,
  plannerPrimaryTabPreference,
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
      <XpProfileProvider>
        <AltitudeBackdrop />
        <JourneyIntroOverlay />
        <DuoProvider
          key={`${duoAvailability}:${duoState.activePartner?.partnerId ?? "none"}`}
          viewerUserId={userId}
          viewerLabel={viewerLabel}
          initialState={duoState}
          availability={duoAvailability}
          initialScopePreference={initialDuoScopePreference}
        >
          <div className="flex min-h-screen w-full justify-center px-4 py-4 sm:px-6 sm:py-6">
            <div className="flex w-full max-w-5xl flex-col gap-4 md:gap-6">
              <header
                className="sticky top-0 z-40 -mx-4 -mt-4 border-b bg-background/80 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70 md:static md:m-0 md:rounded-2xl md:border md:bg-card/95 md:p-4"
                style={{ viewTransitionName: "app-shell-header" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight">Goalmaxxing</h1>
                    <XpProgressBar />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Button asChild size="sm" className="h-8" title="New Goal +">
                      <Link href={newGoalHref}>
                        New Goal +
                      </Link>
                    </Button>
                    <DuoScopeToggle />
                  </div>
                </div>
                <div className="mt-4 hidden md:block">
                  <TabNav plannerPrimaryTabPreference={plannerPrimaryTabPreference} />
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
          <div className="md:hidden" style={{ viewTransitionName: "app-mobile-tab-nav" }}>
            <TabNav
              mobile
              plannerPrimaryTabPreference={plannerPrimaryTabPreference}
            />
          </div>
          {goalSheet}
        </DuoProvider>
      </XpProfileProvider>
    </XpRewardProvider>
  );
}
