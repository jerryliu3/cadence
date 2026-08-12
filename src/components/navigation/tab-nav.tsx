"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const gridClass = GRID_BY_COUNT[APP_TABS.length] ?? "grid-cols-4";

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
            ? `${gridClass} rounded-2xl border border-border/60 bg-background/70 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/55`
            : gridClass
        )}
      >
        {APP_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "flex w-full items-center justify-center rounded-xl px-2 font-medium transition-colors",
                  mobile
                    ? "min-h-12 flex-col gap-1 py-1.5 text-[10px]"
                    : "min-h-14 flex-col gap-1 py-2 text-[11px]",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
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
