"use client";

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
import { GroupGoalsSection } from "@/features/social/group-goals-section";
import { NotificationsSection } from "@/features/social/notifications-section";
import { ProfileSection } from "@/features/social/profile-section";
import { useSocialTabData } from "@/features/social/use-social-tab-data";
import { useOutsidePointerDismiss } from "@/lib/ui/use-outside-pointer-dismiss";

export function SocialTab() {
  const {
    state,
    loading,
    saving,
    signingOut,
    authEmail,
    searchTerm,
    setSearchTerm,
    setSelectedShareGoalIds,
    selectedGroupGoalId,
    setSelectedGroupGoalId,
    shareMenuOpen,
    setShareMenuOpen,
    shareMenuPosition,
    setShareMenuPosition,
    sharedMonthCursor,
    setSharedMonthCursor,
    groupDraft,
    setGroupDraft,
    profileDraft,
    setProfileDraft,
    visibleSearchResults,
    shareableGoals,
    ownGroupGoals,
    activeSelectedShareGoalIds,
    shareMenuListMaxHeight,
    outgoingSharesByGoal,
    sharedByMeGoals,
    completionsByGoal,
    groupRequiresEndDate,
    updateGroupFrequencyType,
    saveProfile,
    shareGoalWithUser,
    revokeGoalShare,
    removeSharedGoalForMe,
    inviteToGroupGoal,
    createGroupGoal,
    removeParticipant,
    leaveGroup,
    deleteGroupGoal,
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
  }, []);

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
  }, [shareMenuOpen, updateShareMenuPosition]);

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
        : "Share goals, manage collaboration, and configure group participation.";

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
        setProfileDraft={setProfileDraft}
        onSaveProfile={saveProfile}
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Settings menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {[
            { key: "preferences", label: "Preferences" },
            { key: "notifications", label: "Notifications" },
            { key: "social", label: "Social" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="flex w-full items-center justify-between border-t px-4 py-3 text-left text-sm transition-colors hover:bg-muted/30 first:border-t-0"
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

      <Dialog open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen}>
        <DialogContent
          className="!top-0 !right-0 !left-auto !translate-x-0 !translate-y-0 inset-y-0 h-dvh w-[min(100vw,48rem)] max-w-none rounded-none border-l p-0"
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
        selectedGroupGoalId={selectedGroupGoalId}
        setSelectedGroupGoalId={setSelectedGroupGoalId}
        ownGroupGoals={ownGroupGoals}
        shareMenuPosition={shareMenuPosition}
        shareMenuListMaxHeight={shareMenuListMaxHeight}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        visibleSearchResults={visibleSearchResults}
        shareGoalWithUser={shareGoalWithUser}
        inviteToGroupGoal={inviteToGroupGoal}
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

      <GroupGoalsSection
        groupDraft={groupDraft}
        setGroupDraft={setGroupDraft}
        groupRequiresEndDate={groupRequiresEndDate}
        updateGroupFrequencyType={updateGroupFrequencyType}
        createGroupGoal={createGroupGoal}
        saving={saving}
        groupGoals={state.groupGoals}
        participants={state.participants}
        completionsByGoal={completionsByGoal}
        currentUserId={state.userId}
        profileDirectory={state.profileDirectory}
        deleteGroupGoal={deleteGroupGoal}
        leaveGroup={leaveGroup}
        removeParticipant={removeParticipant}
      />
        </>
      ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
