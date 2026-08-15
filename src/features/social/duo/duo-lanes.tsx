"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  resolveDuoLanes,
  type DuoLaneSubject,
  type DuoScope,
} from "@cadence/shared/social/duo";
export type { DuoLaneSubject, DuoScope } from "@cadence/shared/social/duo";

export function DuoLanes({
  scope,
  viewer,
  partner,
  renderLane,
  className,
}: {
  scope: DuoScope;
  viewer: DuoLaneSubject;
  partner: DuoLaneSubject | null;
  renderLane: (subject: DuoLaneSubject) => ReactNode;
  className?: string;
}): ReactNode {
  const lanes = resolveDuoLanes({
    scope,
    viewer,
    partner,
  });

  return (
    <div
      className={cn(
        "grid gap-4",
        lanes.length > 1 ? "md:grid-cols-2" : "grid-cols-1",
        className
      )}
    >
      {lanes.map((subject) => (
        <section key={subject.id} className="space-y-2">
          {scope !== "me" ? (
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {subject.label}
              </span>
              {subject.readOnly ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  Read-only
                </span>
              ) : null}
            </div>
          ) : null}
          {renderLane(subject)}
        </section>
      ))}
    </div>
  );
}
