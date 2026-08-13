"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { APP_TABS } from "@/components/navigation/tabs";
import { cn } from "@/lib/utils";

const GRID_BY_COUNT: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname.startsWith(href);
}

interface TabNavProps {
  mobile?: boolean;
}

export function TabNav({ mobile = false }: TabNavProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const gridClass = GRID_BY_COUNT[APP_TABS.length] ?? "grid-cols-4";
  const currentIndex = APP_TABS.findIndex((tab) => isActive(pathname, tab.href));
  const highlightLayoutId = mobile ? "mobile-tab-highlight" : "desktop-tab-highlight";

  return (
    <nav
      className={cn(
        "w-full",
        mobile
          ? "fixed inset-x-0 bottom-[max(calc(env(safe-area-inset-bottom)-0.35rem),0rem)] z-40 flex justify-center px-2"
          : "mx-auto rounded-2xl border bg-card/90 p-1"
      )}
      style={mobile ? { viewTransitionName: "app-shell-tab-nav" } : undefined}
      aria-label="Main navigation"
    >
      <ul
        className={cn(
          "grid w-full gap-1",
          mobile
            ? `${gridClass} max-w-[22.5rem] rounded-[1.35rem] border border-transparent bg-transparent p-1.5 shadow-none backdrop-blur-none supports-[backdrop-filter]:bg-transparent`
            : gridClass
        )}
      >
        {APP_TABS.map((tab, targetIndex) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="relative">
              <Link
                href={tab.href}
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
