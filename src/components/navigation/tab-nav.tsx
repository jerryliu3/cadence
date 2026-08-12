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
          ? "fixed inset-x-0 bottom-[max(calc(env(safe-area-inset-bottom)-0.35rem),0rem)] z-40 flex justify-center px-2"
          : "mx-auto rounded-2xl border bg-card/90 p-1"
      )}
      aria-label="Main navigation"
    >
      <ul
        className={cn(
          "grid w-full gap-1",
          mobile
            ? `${gridClass} max-w-[22.5rem] rounded-[1.35rem] border border-border/35 bg-transparent p-1.5 shadow-[0_14px_40px_-28px_hsl(var(--foreground))] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-transparent`
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
