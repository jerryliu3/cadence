"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import type { PlannerPrimaryTabPreference } from "@cadence/shared/navigation/tabs";
import { buildAppTabs } from "@/components/navigation/tabs";
import { cn } from "@/lib/utils";

const GRID_BY_COUNT: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname.startsWith(href);
}

interface TabNavProps {
  mobile?: boolean;
  plannerPrimaryTabPreference?: PlannerPrimaryTabPreference;
}

export function TabNav({
  mobile = false,
  plannerPrimaryTabPreference,
}: TabNavProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const tabs = useMemo(
    () => buildAppTabs(plannerPrimaryTabPreference),
    [plannerPrimaryTabPreference]
  );
  const [optimisticNav, setOptimisticNav] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const activePath =
    optimisticNav && optimisticNav.from === pathname
      ? optimisticNav.to
      : pathname;
  const gridClass = GRID_BY_COUNT[tabs.length] ?? "grid-cols-4";
  const currentIndex = tabs.findIndex((tab) => isActive(activePath, tab.href));
  const highlightLayoutId = mobile ? "mobile-tab-highlight" : "desktop-tab-highlight";

  return (
    <nav
      className={cn(
        "w-full",
        mobile
          ? "fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.4rem)]"
          : "mx-auto rounded-2xl border bg-card/90 p-1"
      )}
      aria-label="Main navigation"
    >
      <ul
        className={cn(
          "grid w-full gap-1",
          mobile
            ? `${gridClass} max-w-[27rem] rounded-[1.35rem] border border-border/20 bg-background/50 p-1.5 shadow-sm shadow-black/5 backdrop-blur-md supports-[backdrop-filter]:bg-background/50`
            : gridClass
        )}
      >
        {tabs.map((tab, targetIndex) => {
          const active = isActive(activePath, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="relative">
              <Link
                href={tab.href}
                onClick={() => {
                  if (!isActive(pathname, tab.href)) {
                    setOptimisticNav({ from: pathname, to: tab.href });
                  }
                }}
                transitionTypes={
                  active || currentIndex === -1
                    ? undefined
                    : [
                        targetIndex > currentIndex
                          ? "nav-forward"
                          : "nav-back",
                      ]
                }
                className={cn(
                  "relative isolate flex w-full touch-manipulation items-center justify-center rounded-xl px-2 font-medium transition-[color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none",
                  mobile
                    ? "min-h-12 flex-col gap-1 py-1.5 text-[10px]"
                    : "min-h-14 flex-col gap-1 py-2 text-[11px]",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                {active ? (
                  <motion.span
                    layoutId={highlightLayoutId}
                    aria-hidden="true"
                    data-motion="tab-nav-highlight"
                    className="absolute inset-0 -z-10 rounded-xl bg-primary shadow-sm"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            duration: 0.24,
                            ease: [0.22, 1, 0.36, 1],
                          }
                    }
                  />
                ) : null}
                <Icon className="size-5" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
