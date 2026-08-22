"use client";

import {
  ArrowLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import type { PlannerPrimaryTabPreference } from "@cadence/shared/navigation/tabs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/loading-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  JOURNEY_INTRO_SEEN_KEY,
  JOURNEY_ONBOARDING_COMPLETED_KEY,
  requestJourneyIntroOpen,
} from "@/components/intro/journey-intro-overlay";
import { STARTER_PACKS } from "@/features/goals/starter-packs";
import { TabOnboardingOverlay } from "@/features/onboarding/tab-onboarding-overlay";
import {
  TAB_ONBOARDING_REPLAY_LINKS,
  clearAllTabOnboardingProgress,
} from "@/features/onboarding/tab-onboarding";
import { IntegrationsSettings } from "@/features/settings/integrations-settings";
import { PlannerPreferencesSettings } from "@/features/settings/planner-preferences-settings";
import { ReportIssueSettings } from "@/features/settings/report-issue-settings";
import { NotificationsSection } from "@/features/social/notifications-section";
import { ProfileSection } from "@/features/social/profile-section";
import { useSocialTabData } from "@/features/social/use-social-tab-data";

export function SocialTab() {
  const searchParams = useSearchParams();
  const {
    state,
    loading,
    saving,
    signingOut,
    authEmail,
    profileDraft,
    setProfileDraft,
    uploadProfileAvatarFile,
    plannerPreferencesLoading,
    plannerPreferencesDraft,
    setPlannerPreferencesDraft,
    canSaveProfile,
    canSavePreferences,
    saveProfile,
    savePreferences,
    signOut,
  } = useSocialTabData();
  const [settingsSection, setSettingsSection] = useState<
    "preferences" | "notifications" | "integrations" | "report-issue"
  >("preferences");
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  const settingsSectionTitle =
    settingsSection === "preferences"
      ? "Preferences"
      : settingsSection === "notifications"
        ? "Notifications"
        : settingsSection === "integrations"
          ? "Integrations"
          : "Report an issue";
  const settingsSectionDescription =
    settingsSection === "preferences"
      ? "Manage planner defaults and checklist/calendar ordering."
      : settingsSection === "notifications"
        ? "Configure push access and reminder schedules."
        : settingsSection === "integrations"
          ? "Connect Apple Health or Health Connect and opt into auto-complete."
          : "Send product bugs or UX friction details directly to support.";

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
      <TabOnboardingOverlay
        onboardingKey="settings.profile"
        title="Profile and settings guide"
        description="Use this page to update profile details, replay onboarding guides, and configure planner, notifications, and integrations."
        forceOpen={searchParams.get("onboarding") === "settings.profile"}
      />
      <ProfileSection
        userId={state.userId}
        profile={state.profile}
        profileDraft={profileDraft}
        authEmail={authEmail}
        saving={saving}
        canSaveProfile={canSaveProfile}
        setProfileDraft={setProfileDraft}
        onSaveProfile={saveProfile}
        onUploadAvatar={uploadProfileAvatarFile}
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Manage preferences, notifications, integrations, and support options.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {[
            { key: "preferences", label: "Preferences" },
            { key: "notifications", label: "Notifications" },
            { key: "integrations", label: "Integrations" },
            { key: "report-issue", label: "Report an issue" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="flex w-full items-center justify-between border-t px-4 py-3 text-left text-base font-medium transition-colors hover:bg-muted/30 first:border-t-0"
              onClick={() => {
                setSettingsSection(
                  item.key as
                    | "preferences"
                    | "notifications"
                    | "integrations"
                    | "report-issue"
                );
                setSettingsPanelOpen(true);
              }}
            >
              <span>{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ))}
          <div className="border-t p-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Onboarding guides
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={requestJourneyIntroOpen}
                  >
                    Replay app intro
                  </Button>
                  {TAB_ONBOARDING_REPLAY_LINKS.map((link) => (
                    <Button key={link.key} type="button" variant="outline" size="sm" asChild>
                      <Link href={link.href}>{link.label}</Link>
                    </Button>
                  ))}
                  {STARTER_PACKS.map((pack) => (
                    <Button key={pack.key} type="button" variant="outline" size="sm" asChild>
                      <Link href={`/goals/new?mode=multi&starterPack=${pack.key}`}>
                        Open {pack.label} starter pack
                      </Link>
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearAllTabOnboardingProgress();
                      window.localStorage.removeItem(JOURNEY_ONBOARDING_COMPLETED_KEY);
                      window.localStorage.removeItem(JOURNEY_INTRO_SEEN_KEY);
                      toast.success("Onboarding guides reset.");
                    }}
                  >
                    Reset all onboarding guides
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                >
                  <LogOut className="size-4" />
                  {signingOut ? "Signing out..." : "Sign out"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog modal={false} open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen}>
        <DialogContent
          className="!top-0 !right-0 !left-auto !translate-x-0 !translate-y-0 inset-y-0 h-dvh w-[min(100vw,72rem)] max-w-none overflow-hidden rounded-none border-l p-0"
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
          <div className="h-[calc(100dvh-5.5rem)] overflow-y-auto overflow-x-hidden p-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {settingsSection === "preferences" ? (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Preferences</CardTitle>
                  <CardDescription>
                    Manage planner defaults and checklist/calendar ordering.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PlannerPreferencesSettings
                    value={plannerPreferencesDraft}
                    onChange={setPlannerPreferencesDraft}
                    disabled={plannerPreferencesLoading || saving}
                  />
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <div className="space-y-1">
                      <Label htmlFor="preferences-planner-primary-tab">
                        Primary planner tab
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Choose whether Checklist or Calendar appears first in planner navigation.
                      </p>
                    </div>
                    <Select
                      value={profileDraft.planner_primary_tab}
                      onValueChange={(value: PlannerPrimaryTabPreference) =>
                        setProfileDraft((prev) => ({ ...prev, planner_primary_tab: value }))
                      }
                    >
                      <SelectTrigger
                        id="preferences-planner-primary-tab"
                        className="w-full sm:w-72"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checklist">Checklist first</SelectItem>
                        <SelectItem value="calendar">Calendar first</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="space-y-2 border-t pt-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Privacy</p>
                        <p className="text-xs text-muted-foreground">
                          Control whether your social activity appears in feeds and leaderboards.
                        </p>
                      </div>
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={profileDraft.social_activity_visible}
                          onChange={(event) =>
                            setProfileDraft((prev) => ({
                              ...prev,
                              social_activity_visible: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          Social activity enabled
                          <span className="block text-xs text-muted-foreground">
                            Turn off to hide your activity from social feed and leaderboard listings.
                          </span>
                        </span>
                      </label>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void savePreferences()}
                      disabled={
                        saving ||
                        plannerPreferencesLoading ||
                        !canSavePreferences
                      }
                    >
                      {saving ? "Saving..." : "Save preferences"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {settingsSection === "notifications" ? (
              <NotificationsSection />
            ) : null}

            {settingsSection === "integrations" ? (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Integrations</CardTitle>
                  <CardDescription>
                    Connect Apple Health or Health Connect and opt into auto-complete.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <IntegrationsSettings goals={state.ownGoals} />
                </CardContent>
              </Card>
            ) : null}

            {settingsSection === "report-issue" ? (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Report an issue</CardTitle>
                  <CardDescription>
                    Submit an issue title and description. We will save every report and
                    email support when delivery is configured.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ReportIssueSettings />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
