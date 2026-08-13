"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDuoScope } from "@/features/social/duo/duo-context";
import { resolveDuoSurfaceDefault } from "@/lib/social/duo/surface-defaults";
import type { DuoScope } from "@/lib/social/duo/types";

const SCOPE_OPTIONS: Array<{ value: DuoScope; label: string }> = [
  { value: "me", label: "Mine" },
  { value: "partner", label: "Partner" },
  { value: "both", label: "Both" },
];

export function DuoScopeToggle() {
  const pathname = usePathname();
  const surfaceDefault = resolveDuoSurfaceDefault(pathname);
  const { scope, hasActivePartner, setScopePreference } = useDuoScope(surfaceDefault);

  if (!hasActivePartner) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1 rounded-full border border-border/80 bg-background p-1"
      role="radiogroup"
      aria-label="Duo scope"
    >
      {SCOPE_OPTIONS.map((option) => {
        const active = option.value === scope;
        return (
          <Button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
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
