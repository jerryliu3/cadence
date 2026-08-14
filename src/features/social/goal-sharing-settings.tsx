"use client";

import { useCallback, useEffect, useRef } from "react";
import { LoadingCard } from "@/components/ui/loading-card";
import { GoalSharingSection } from "@/features/social/goal-sharing-section";
import { useSocialTabData } from "@/features/social/use-social-tab-data";
import { useOutsidePointerDismiss } from "@/lib/ui/use-outside-pointer-dismiss";

export function GoalSharingSettings() {
  const {
    state,
    loading,
    searchTerm,
    setSearchTerm,
    setSelectedShareGoalIds,
    shareMenuOpen,
    setShareMenuOpen,
    shareMenuPosition,
    setShareMenuPosition,
    sharedMonthCursor,
    setSharedMonthCursor,
    visibleSearchResults,
    shareableGoals,
    activeSelectedShareGoalIds,
    shareMenuListMaxHeight,
    outgoingSharesByGoal,
    sharedByMeGoals,
    completionsByGoal,
    shareGoalWithUser,
    revokeGoalShare,
    removeSharedGoalForMe,
  } = useSocialTabData();
  const shareMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const shareMenuPanelRef = useRef<HTMLDivElement | null>(null);

  const updateShareMenuPosition = useCallback(() => {
    const anchor = shareMenuAnchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 8;
    const availableBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const availableAbove = rect.top - gap - viewportPadding;
    const shouldOpenAbove = availableBelow < 220 && availableAbove > availableBelow;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding
    );
    const maxHeight = Math.max(160, shouldOpenAbove ? availableAbove : availableBelow);

    if (shouldOpenAbove) {
      setShareMenuPosition({
        left,
        width,
        maxHeight,
        top: undefined,
        bottom: window.innerHeight - rect.top + gap,
      });
      return;
    }

    setShareMenuPosition({
      left,
      width,
      maxHeight,
      top: rect.bottom + gap,
      bottom: undefined,
    });
  }, [setShareMenuPosition]);

  useOutsidePointerDismiss({
    enabled: shareMenuOpen,
    containerRef: shareMenuPanelRef,
    shouldIgnoreTarget: (target) =>
      Boolean(shareMenuAnchorRef.current?.contains(target)),
    onDismiss: () => {
      setShareMenuOpen(false);
    },
  });

  useEffect(() => {
    if (!shareMenuOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShareMenuOpen(false);
      }
    };

    const handleViewportChange = () => {
      updateShareMenuPosition();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [shareMenuOpen, setShareMenuOpen, updateShareMenuPosition]);

  if (loading) {
    return (
      <LoadingCard
        title="Loading sharing..."
        description="Syncing goals you can share and goals shared with you."
      />
    );
  }

  return (
    <GoalSharingSection
      shareMenuAnchorRef={shareMenuAnchorRef}
      shareMenuPanelRef={shareMenuPanelRef}
      shareMenuOpen={shareMenuOpen}
      setShareMenuOpen={setShareMenuOpen}
      updateShareMenuPosition={updateShareMenuPosition}
      shareableGoals={shareableGoals}
      activeSelectedShareGoalIds={activeSelectedShareGoalIds}
      setSelectedShareGoalIds={setSelectedShareGoalIds}
      shareMenuPosition={shareMenuPosition}
      shareMenuListMaxHeight={shareMenuListMaxHeight}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      visibleSearchResults={visibleSearchResults}
      shareGoalWithUser={shareGoalWithUser}
      sharedByMeGoals={sharedByMeGoals}
      outgoingSharesByGoal={outgoingSharesByGoal}
      profileDirectory={state.profileDirectory}
      revokeGoalShare={revokeGoalShare}
      sharedMonthCursor={sharedMonthCursor}
      setSharedMonthCursor={setSharedMonthCursor}
      sharedGoals={state.sharedGoals}
      sharedOwners={state.sharedOwners}
      completionsByGoal={completionsByGoal}
      removeSharedGoalForMe={removeSharedGoalForMe}
    />
  );
}
