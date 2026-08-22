"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useState } from "react";
import { subscribeOpenPublicProfile } from "@/lib/social/public-profile-events";

const PublicProfileSheet = dynamic(
  () =>
    import("@/features/social/public-profile/public-profile-sheet").then(
      (module) => module.PublicProfileSheet
    ),
  {
    loading: () => null,
  }
);

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
