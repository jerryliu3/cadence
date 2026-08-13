"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/loading-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlannerPreferencesSettings } from "@/features/settings/planner-preferences-settings";
import { GoalSharingSection } from "@/features/social/goal-sharing-section";
import { NotificationsSection } from "@/features/social/notifications-section";
import { ProfileSection } from "@/features/social/profile-section";
import { useDuo } from "@/features/social/duo/duo-context";
import { useSocialTabData } from "@/features/social/use-social-tab-data";
import { useOutsidePointerDismiss } from "@/lib/ui/use-outside-pointer-dismiss";

export function SocialTab() {
  const { state: duoState, scopePreference } = useDuo();
  const {
    state,
    loading,
    saving,
    signingOut,
    authEmail,
    searchTerm,
    setSearchTerm,
    setSelectedShareGoalIds,
    shareMenuOpen,
    setShareMenuOpen,
    shareMenuPosition,
    setShareMenuPosition,
    sharedMonthCursor,
    setSharedMonthCursor,
    profileDraft,
    setProfileDraft,
    visibleSearchResults,
    shareableGoals,
    activeSelectedShareGoalIds,
    shareMenuListMaxHeight,
    outgoingSharesByGoal,
    sharedByMeGoals,
    completionsByGoal,
    canSaveProfile,
    saveProfile,
    shareGoalWithUser,
    revokeGoalShare,
    removeSharedGoalForMe,
    signOut,
  } = useSocialTabData();
  const [settingsSection, setSettingsSection] = useState<
    "preferences" | "notifications" | "social"
  >("preferences");
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
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

  const settingsSectionTitle =
    settingsSection === "preferences"
      ? "Preferences"
      : settingsSection === "notifications"
        ? "Notifications"
        : "Social";
  const settingsSectionDescription =
    settingsSection === "preferences"
      ? "Manage planner timezone and start-of-week defaults."
      : settingsSection === "notifications"
        ? "Configure push access and reminder schedules."
        : "Share goals and manage who can see them.";
  const activePartner = duoState.activePartner;
  const pendingInvite = duoState.pendingInvite;
  const partnerLabel =
    activePartner?.partnerDisplayName ??
    activePartner?.partnerUsername ??
    "your partner";
  const pendingPartnerLabel =
    pendingInvite?.partnerDisplayName ??
    pendingInvite?.partnerUsername ??
    "your pending partner";

  if (loading) {
    return (
      <LoadingCard
        title="Loading settings..."
        description="Syncing your profile, notifications, and collaboration settings."
      />
    );
  }

  return (
    <div className="space-y-5">
      <ProfileSection
        profile={state.profile}
        profileDraft={profileDraft}
        authEmail={authEmail}
        saving={saving}
        canSaveProfile={canSaveProfile}
        setProfileDraft={setProfileDraft}
        onSaveProfile={saveProfile}
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>User mode</CardTitle>
          <CardDescription>
            {activePartner
              ? `Duo mode is active with ${partnerLabel}.`
              : "Solo mode is active until you have an active partner."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!activePartner && pendingInvite ? (
            <p className="text-sm text-muted-foreground">
              {pendingInvite.isIncoming
                ? `Incoming duo invite from ${pendingPartnerLabel}.`
                : `Pending duo invite sent to ${pendingPartnerLabel}.`}
            </p>
          ) : null}
          {!activePartner && !pendingInvite && (
            <p className="text-sm text-muted-foreground">
              Connect a partner to unlock duo comparisons across Insights and Checklist.
            </p>
          )}
          {!activePartner && (scopePreference === "partner" || scopePreference === "both") ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No active partner is available right now, so views are clamped to solo mode.
            </p>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href="/social?tab=team">
              {activePartner || pendingInvite ? "Manage team status" : "Connect partner"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="space-y-0 p-0">
          {[
            { key: "preferences", label: "Preferences" },
            { key: "notifications", label: "Notifications" },
            { key: "social", label: "Social" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="flex w-full items-center justify-between border-t px-4 py-3 text-left text-base font-medium transition-colors hover:bg-muted/30 first:border-t-0"
              onClick={() => {
                setSettingsSection(
                  item.key as "preferences" | "notifications" | "social"
                );
                setSettingsPanelOpen(true);
              }}
            >
              <span>{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ))}
          <div className="border-t p-4">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => void signOut()}
              disabled={signingOut}
            >
              <LogOut className="size-4" />
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog modal={false} open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen}>
        <DialogContent
          className="!top-0 !right-0 !left-auto !translate-x-0 !translate-y-0 inset-y-0 h-dvh w-[min(100vw,64rem)] max-w-none rounded-none border-l p-0"
          showCloseButton={false}
        >
          <DialogHeader className="gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSettingsPanelOpen(false)}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <DialogTitle>{settingsSectionTitle}</DialogTitle>
            </div>
            <DialogDescription>{settingsSectionDescription}</DialogDescription>
          </DialogHeader>
          <div className="h-[calc(100dvh-5.5rem)] overflow-y-auto p-4">
      {settingsSection === "preferences" ? (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Manage planner timezone and start-of-week defaults.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlannerPreferencesSettings />
          </CardContent>
        </Card>
      ) : null}

      {settingsSection === "notifications" ? (
        <NotificationsSection />
      ) : null}

      {settingsSection === "social" ? (
        <>
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
        </>
      ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
