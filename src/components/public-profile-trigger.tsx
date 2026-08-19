"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { emitOpenPublicProfile } from "@/lib/social/public-profile-events";

interface PublicProfileTriggerProps {
  subjectUserId: string | null | undefined;
  buttonLabel: string;
  className?: string;
  children: ReactNode;
}

export function PublicProfileTrigger({
  subjectUserId,
  buttonLabel,
  className,
  children,
}: PublicProfileTriggerProps) {
  const normalizedSubjectUserId = subjectUserId?.trim() ?? "";

  if (!normalizedSubjectUserId) {
    return <div className={className}>{children}</div>;
  }

  return (
    <button
      type="button"
      aria-label={buttonLabel}
      className={cn(
        "cursor-pointer rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      onClick={() => emitOpenPublicProfile(normalizedSubjectUserId)}
    >
      {children}
    </button>
  );
}
