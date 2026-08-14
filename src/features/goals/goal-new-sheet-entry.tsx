"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { GoalCreationEntry } from "@/features/goals/goal-creation-entry";
import { GoalRouteSheet } from "@/features/goals/goal-route-sheet";
import { resolveSafePostLoginPath } from "@/lib/auth/login-redirect";

export function GoalNewSheetEntry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => {
    const candidate = searchParams.get("returnTo");
    if (!candidate) {
      return null;
    }
    return resolveSafePostLoginPath(candidate);
  }, [searchParams]);
  const closeSheet = useCallback(() => {
    if (returnTo) {
      router.replace(returnTo);
      return;
    }
    router.back();
  }, [returnTo, router]);
  const handleDismiss = useCallback(() => {
    closeSheet();
  }, [closeSheet]);
  const handleComplete = useCallback(() => {
    closeSheet();
    router.refresh();
  }, [closeSheet, router]);

  return (
    <GoalRouteSheet onClose={handleDismiss} title="Create goal">
      <GoalCreationEntry onExit={handleComplete} />
    </GoalRouteSheet>
  );
}
