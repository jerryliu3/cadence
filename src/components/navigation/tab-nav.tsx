"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ListChecks, UsersRound } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

type TabLink = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const tabs: TabLink[] = [
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/", label: "Today", icon: ListChecks },
  { href: "/social", label: "Social", icon: UsersRound },
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
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
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
