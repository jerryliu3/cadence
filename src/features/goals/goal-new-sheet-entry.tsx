"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { GoalCreationEntry } from "@/features/goals/goal-creation-entry";
import { GoalRouteSheet } from "@/features/goals/goal-route-sheet";

export function GoalNewSheetEntry() {
  const router = useRouter();
  const handleDismiss = useCallback(() => {
    router.back();
  }, [router]);
  const handleComplete = useCallback(() => {
    router.back();
    router.refresh();
  }, [router]);

  return (
    <GoalRouteSheet onClose={handleDismiss} title="Create goal">
      <GoalCreationEntry onExit={handleComplete} />
    </GoalRouteSheet>
  );
}
