"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import type { PlannerPrimaryTabPreference } from "@cadence/shared/navigation/tabs";
import { useState } from "react";
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
import { requestJourneyIntroOpen } from "@/components/intro/journey-intro-overlay";
import { IntegrationsSettings } from "@/features/settings/integrations-settings";
import { PlannerPreferencesSettings } from "@/features/settings/planner-preferences-settings";
import { NotificationsSection } from "@/features/social/notifications-section";
import { ProfileSection } from "@/features/social/profile-section";
import { useDuo } from "@/features/social/duo/duo-context";
import { useSocialTabData } from "@/features/social/use-social-tab-data";

export function SocialTab() {
  const { state: duoState, scopePreference } = useDuo();
  const {
    state,
    loading,
    saving,
    signingOut,
    authEmail,
    profileDraft,
    setProfileDraft,
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
    "preferences" | "notifications" | "integrations"
  >("preferences");
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  const settingsSectionTitle =
    settingsSection === "preferences"
      ? "Preferences"
      : settingsSection === "notifications"
        ? "Notifications"
        : "Integrations";
  const settingsSectionDescription =
    settingsSection === "preferences"
      ? "Manage planner defaults and checklist/calendar ordering."
      : settingsSection === "notifications"
        ? "Configure push access and reminder schedules."
        : "Connect Apple Health or Health Connect and opt into auto-complete.";
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
            { key: "integrations", label: "Integrations" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="flex w-full items-center justify-between border-t px-4 py-3 text-left text-base font-medium transition-colors hover:bg-muted/30 first:border-t-0"
              onClick={() => {
                setSettingsSection(
                  item.key as "preferences" | "notifications" | "integrations"
                );
                setSettingsPanelOpen(true);
              }}
            >
              <span>{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ))}
          <div className="border-t p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={requestJourneyIntroOpen}
              >
                Replay onboarding
              </Button>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
