"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ListChecks, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

type TabLink = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const tabs: TabLink[] = [
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/", label: "Checklist", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
  const currentIndex = tabs.findIndex((tab) => isActive(pathname, tab.href));

  return (
    <nav
      className={cn(
        "w-full",
        mobile
          ? "fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
          : "rounded-2xl border bg-card/90 p-1"
      )}
      aria-label="Main navigation"
    >
      <ul className={cn("grid w-full grid-cols-3 gap-1", !mobile && "max-w-xl")}>
        {tabs.map((tab, targetIndex) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
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
                  "flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-[color,background-color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
