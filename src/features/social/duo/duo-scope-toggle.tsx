"use client";

import { usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDuoScope } from "@/features/social/duo/duo-context";
import { resolveDuoSurfaceDefault } from "@/lib/social/duo/surface-defaults";
import type { DuoScope } from "@cadence/shared/social/duo";

const SCOPE_OPTIONS: Array<{ value: DuoScope; label: string }> = [
  { value: "me", label: "Solo" },
  { value: "partner", label: "Partner" },
  { value: "both", label: "Duo" },
];

export function DuoScopeToggle() {
  const pathname = usePathname();
  const surfaceDefault = resolveDuoSurfaceDefault(pathname);
  const { scope, hasActivePartner, setScopePreference } = useDuoScope(surfaceDefault);

  if (!hasActivePartner) {
    return null;
  }

  const selectedScope = SCOPE_OPTIONS.find((option) => option.value === scope);

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Mode:</span>
      <label htmlFor="duo-scope-toggle" className="sr-only">
        Duo scope
      </label>
      <Select
        value={scope}
        onValueChange={(value) => setScopePreference(value as DuoScope)}
      >
        <SelectTrigger
          id="duo-scope-toggle"
          aria-label="Duo scope"
          className="h-8 rounded-full bg-background/90 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {SCOPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="sr-only" aria-live="polite">
        {selectedScope?.label ?? "Solo"} view selected
      </span>
    </div>
  );
}
