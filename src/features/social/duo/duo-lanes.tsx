"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DuoScope } from "@/lib/social/duo/types";

export interface DuoLaneSubject {
  id: "viewer" | "partner";
  label: string;
  userId?: string;
  readOnly: boolean;
}

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
  // Without a partner every scope collapses to the viewer, so the partner-less
  // cases never need their own branch.
  const lanes = !partner
    ? [viewer]
    : scope === "partner"
      ? [partner]
      : scope === "both"
        ? [viewer, partner]
        : [viewer];

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
