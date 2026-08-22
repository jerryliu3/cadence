"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  resolveDuoLanes,
  type DuoLaneSubject,
  type DuoScope,
} from "@cadence/shared/social/duo";
import { PublicProfileTrigger } from "@/components/public-profile-trigger";
import { UserAvatar } from "@/components/user-avatar";
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
  const swipeColumns = lanes.length > 1;

  return (
    <div
      data-testid={swipeColumns ? "duo-lanes-scroll" : undefined}
      className={cn(
        "gap-4",
        swipeColumns
          ? "flex snap-x snap-mandatory overflow-x-auto pb-1 md:grid md:snap-none md:overflow-visible md:pb-0 md:grid-cols-2"
          : "grid grid-cols-1",
        className
      )}
    >
      {lanes.map((subject) => (
        <section
          key={subject.id}
          className={cn(
            "space-y-2 content-start",
            swipeColumns
              ? "w-[85vw] max-w-[30rem] shrink-0 snap-center md:w-auto md:max-w-none md:shrink"
              : undefined
          )}
        >
          {scope !== "me" ? (
            <div className="flex min-h-12 items-center gap-3 px-1">
              <PublicProfileTrigger
                subjectUserId={subject.userId}
                buttonLabel={`Open ${subject.label} profile`}
                className="-ml-1.5 flex min-w-0 items-center gap-3"
              >
                <UserAvatar
                  avatarUrl={subject.avatarUrl ?? null}
                  displayName={subject.label}
                  username={null}
                  size="sm"
                  alt={`${subject.label} avatar`}
                />
                <span className="text-base font-medium uppercase tracking-wide text-muted-foreground">
                  {subject.label}
                </span>
              </PublicProfileTrigger>
              {subject.readOnly ? (
                <span className="rounded-full border border-border px-2 py-1 text-sm text-muted-foreground">
                  View only
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
