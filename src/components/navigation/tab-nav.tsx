"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ListChecks,
  UserRound,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

type TabLink = {
  key: "insights" | "checklist" | "calendar" | "profile";
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const tabs: TabLink[] = [
  { key: "insights", href: "/insights", label: "Insights", icon: BarChart3 },
  { key: "checklist", href: "/", label: "Checklist", icon: ListChecks },
  {
    key: "calendar",
    href: "/?tab=calendar",
    label: "Calendar",
    icon: CalendarDays,
  },
  { key: "profile", href: "/settings", label: "Profile", icon: UserRound },
];

interface TabNavProps {
  mobile?: boolean;
}

export function TabNav({ mobile = false }: TabNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeKey: TabLink["key"] = pathname.startsWith("/insights")
    ? "insights"
    : pathname.startsWith("/settings")
      ? "profile"
      : pathname === "/" && tabParam === "calendar"
        ? "calendar"
        : "checklist";

  return (
    <nav
      className={cn(
        "w-full",
        mobile
          ? "fixed inset-x-0 z-30 px-4"
          : "rounded-2xl border bg-card/90 p-1"
      )}
      style={
        mobile
          ? { bottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }
          : undefined
      }
      aria-label="Main navigation"
    >
      <ul
        className={cn(
          "grid w-full grid-cols-4 gap-1",
          mobile
            ? "rounded-2xl border border-border/60 bg-background/70 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/55"
            : "max-w-xl"
        )}
      >
        {tabs.map((tab) => {
          const active = activeKey === tab.key;
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "flex w-full items-center justify-center rounded-xl px-2 py-2 font-medium transition-colors",
                  mobile
                    ? "min-h-12 flex-col gap-0.5 text-[11px]"
                    : "gap-2 text-sm",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn(mobile ? "size-[18px]" : "size-4")} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
