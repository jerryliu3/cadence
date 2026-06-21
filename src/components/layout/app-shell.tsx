"use client";

import { format } from "date-fns";
import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, type TouchEventHandler, useMemo, useRef, useState } from "react";
import { TabNav } from "@/components/navigation/tab-nav";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface AppShellProps {
  children: ReactNode;
  userEmail: string;
}

const tabOrder = ["/insights", "/", "/social"] as const;

function getActiveTabPath(pathname: string): (typeof tabOrder)[number] {
  if (pathname.startsWith("/insights")) {
    return "/insights";
  }

  if (pathname.startsWith("/social")) {
    return "/social";
  }

  return "/";
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const signOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
    setIsSigningOut(false);
  };

  const onTouchStart: TouchEventHandler<HTMLElement> = (event) => {
    if (event.touches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }

    const target = event.target as HTMLElement | null;
    const ignoreSwipe = target?.closest(
      "a,button,input,textarea,select,label,[role='button'],[data-no-swipe='true']"
    );

    if (ignoreSwipe) {
      swipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = (event) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;

    if (!start || event.changedTouches.length === 0) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    const currentTab = getActiveTabPath(pathname);
    const currentIndex = tabOrder.indexOf(currentTab);

    if (currentIndex === -1) {
      return;
    }

    const targetIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= tabOrder.length) {
      return;
    }

    router.push(tabOrder[targetIndex]);
  };

  return (
    <div
      className="flex min-h-screen w-full justify-center px-4 py-4 sm:px-6 sm:py-6"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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

        <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      </div>

      <div className="md:hidden">
        <TabNav mobile />
      </div>
    </div>
  );
}
