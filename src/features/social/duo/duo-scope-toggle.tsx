"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDuoScope } from "@/features/social/duo/duo-context";
import type { DuoScope } from "@/lib/social/duo/types";

const SCOPE_OPTIONS: Array<{ value: DuoScope; label: string }> = [
  { value: "me", label: "Mine" },
  { value: "partner", label: "Partner" },
  { value: "both", label: "Both" },
];

function resolveSurfaceDefault(pathname: string | null): DuoScope {
  if (!pathname) {
    return "me";
  }
  if (pathname.startsWith("/insights")) {
    return "both";
  }
  if (pathname.startsWith("/checklist")) {
    return "me";
  }
  return "me";
}

export function DuoScopeToggle() {
  const pathname = usePathname();
  const surfaceDefault = resolveSurfaceDefault(pathname);
  const { scope, hasActivePartner, setScopePreference } = useDuoScope(surfaceDefault);

  if (!hasActivePartner) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-border/80 bg-background p-1">
      {SCOPE_OPTIONS.map((option) => {
        const active = option.value === scope;
        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setScopePreference(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
