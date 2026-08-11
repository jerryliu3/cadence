"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ListChecks,
  Plus,
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
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
  },
  { key: "profile", href: "/settings", label: "Profile", icon: UserRound },
];

const mobileTabs = [
  tabs[0],
  tabs[1],
  { key: "new-goal", href: "/goals/new", label: "New goal", icon: Plus },
  tabs[2],
  tabs[3],
] as const;

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
      : pathname.startsWith("/calendar") ||
          (pathname === "/" && tabParam === "calendar")
        ? "calendar"
        : "checklist";

  return (
    <nav
      className={cn(
        "w-full",
        mobile
          ? "fixed inset-x-0 z-30 px-4"
          : "mx-auto rounded-2xl border bg-card/90 p-1"
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
          "grid w-full gap-1",
          mobile
            ? "grid-cols-5 rounded-2xl border border-border/60 bg-background/70 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/55"
            : "grid-cols-4"
        )}
      >
        {(mobile ? mobileTabs : tabs).map((tab) => {
          const actionItem = tab.key === "new-goal";
          const active = !actionItem && activeKey === tab.key;
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "flex w-full items-center justify-center rounded-xl px-2 font-medium transition-colors",
                  actionItem
                    ? "h-12 bg-blue-600 text-white shadow-sm hover:bg-blue-500"
                    : mobile
                      ? "min-h-12 flex-col gap-1 py-1.5 text-[10px]"
                      : "min-h-14 flex-col gap-1 py-2 text-[11px]",
                  !actionItem &&
                    (active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground")
                )}
                aria-current={active ? "page" : undefined}
                aria-label={tab.label}
              >
                <Icon className={cn(actionItem ? "size-6" : mobile ? "size-5" : "size-5")} />
                {actionItem ? null : <span>{tab.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
