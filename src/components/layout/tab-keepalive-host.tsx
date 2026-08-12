"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightsTab } from "@/features/insights/insights-tab";
import { CalendarPageShell } from "@/features/planner/calendar-page-shell";
import { SocialSurface } from "@/features/social/social-surface";
import { ChecklistShell } from "@/features/today/checklist-shell";

export const KEEPALIVE_TAB_PATHS = [
  "/calendar",
  "/checklist",
  "/insights",
  "/social",
] as const;

export type KeepaliveTabPath = (typeof KEEPALIVE_TAB_PATHS)[number];

interface TabKeepaliveHostProps {
  activePath: KeepaliveTabPath;
  socialEnabled: boolean;
}

function SocialDisabledCard() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Social is not enabled yet</CardTitle>
        <CardDescription>
          Social surfaces are staged behind `SOCIAL_ENABLED`.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export function TabKeepaliveHost({
  activePath,
  socialEnabled,
}: TabKeepaliveHostProps) {
  const [mountedPaths, setMountedPaths] = useState<KeepaliveTabPath[]>(() => [activePath]);

  useEffect(() => {
    setMountedPaths((current) => {
      if (current.includes(activePath)) {
        return current;
      }
      return [...current, activePath];
    });
  }, [activePath]);

  const mountedPathSet = useMemo(() => new Set(mountedPaths), [mountedPaths]);

  return (
    <div data-testid="tab-keepalive-host">
      {KEEPALIVE_TAB_PATHS.map((path) => {
        if (!mountedPathSet.has(path)) {
          return null;
        }
        const isActive = path === activePath;
        return (
          <section
            key={path}
            data-tab-path={path}
            className={isActive ? "block" : "hidden"}
            aria-hidden={!isActive}
          >
            {path === "/calendar" ? <CalendarPageShell /> : null}
            {path === "/checklist" ? <ChecklistShell /> : null}
            {path === "/insights" ? <InsightsTab /> : null}
            {path === "/social" ? (
              socialEnabled ? (
                <SocialSurface />
              ) : (
                <SocialDisabledCard />
              )
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
