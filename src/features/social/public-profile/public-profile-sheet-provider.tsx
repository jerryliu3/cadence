"use client";

import { type ReactNode, useEffect, useState } from "react";
import { PublicProfileSheet } from "@/features/social/public-profile/public-profile-sheet";
import { subscribeOpenPublicProfile } from "@/lib/social/public-profile-events";

export function PublicProfileSheetProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [subjectUserId, setSubjectUserId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeOpenPublicProfile((nextSubjectUserId) => {
      setSubjectUserId(nextSubjectUserId);
    });
  }, []);

  return (
    <>
      {children}
      {subjectUserId ? (
        <PublicProfileSheet
          subjectUserId={subjectUserId}
          onClose={() => setSubjectUserId(null)}
        />
      ) : null}
    </>
  );
}
