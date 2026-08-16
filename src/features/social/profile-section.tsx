"use client";

import { WandSparkles } from "lucide-react";
import type {
  DefaultMainPagePreference,
  PlannerPrimaryTabPreference,
} from "@cadence/shared/navigation/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Profile } from "@/lib/goals/types";

interface ProfileDraft {
  username: string;
  display_name: string;
  avatar_url: string;
  default_main_page: DefaultMainPagePreference;
  planner_primary_tab: PlannerPrimaryTabPreference;
}

interface ProfileSectionProps {
  profile: Profile | null;
  profileDraft: ProfileDraft;
  authEmail: string;
  saving: boolean;
  canSaveProfile: boolean;
  setProfileDraft: (updater: (previous: ProfileDraft) => ProfileDraft) => void;
  avatarUrlError: string | null;
  onSaveProfile: () => Promise<void>;
}

function getInitials(profile: Profile | null) {
  if (!profile) {
    return "??";
  }
  return (profile.display_name ?? profile.username).slice(0, 2).toUpperCase();
}

export function ProfileSection({
  profile,
  profileDraft,
  authEmail,
  saving,
  canSaveProfile,
  setProfileDraft,
  avatarUrlError,
  onSaveProfile,
}: ProfileSectionProps) {
  const avatarPreviewUrl = profileDraft.avatar_url.trim();

  return (
    <Card className="overflow-visible shadow-sm">
      <CardHeader>
        <CardTitle>Account profile</CardTitle>
        <CardDescription>Username is used for sharing and invites.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar>
            {avatarPreviewUrl && !avatarUrlError ? (
              <AvatarImage src={avatarPreviewUrl} alt="Profile avatar preview" />
            ) : null}
            <AvatarFallback>{getInitials(profile)}</AvatarFallback>
          </Avatar>
          <div className="text-sm text-muted-foreground">
            Keep this profile updated so collaborators can find you quickly.
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-username">Username</Label>
            <Input
              id="profile-username"
              value={profileDraft.username}
              onChange={(event) =>
                setProfileDraft((prev) => ({
                  ...prev,
                  username: event.target.value.trim().toLowerCase(),
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-display-name">Display name</Label>
            <Input
              id="profile-display-name"
              value={profileDraft.display_name}
              onChange={(event) =>
                setProfileDraft((prev) => ({ ...prev, display_name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-default-main-page">Default landing page</Label>
            <Select
              value={profileDraft.default_main_page}
              onValueChange={(value: DefaultMainPagePreference) =>
                setProfileDraft((prev) => ({ ...prev, default_main_page: value }))
              }
            >
              <SelectTrigger id="profile-default-main-page" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calendar">Calendar</SelectItem>
                <SelectItem value="checklist">Checklist</SelectItem>
                <SelectItem value="insights">Insights</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-planner-primary-tab">Primary planner tab</Label>
            <Select
              value={profileDraft.planner_primary_tab}
              onValueChange={(value: PlannerPrimaryTabPreference) =>
                setProfileDraft((prev) => ({ ...prev, planner_primary_tab: value }))
              }
            >
              <SelectTrigger id="profile-planner-primary-tab" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checklist">Checklist first</SelectItem>
                <SelectItem value="calendar">Calendar first</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              value={authEmail}
              readOnly
              aria-readonly
              className="bg-muted/30 text-muted-foreground"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-avatar-url">Avatar URL (optional)</Label>
          <Input
            id="profile-avatar-url"
            value={profileDraft.avatar_url}
            placeholder="https://example.com/avatar.png"
            autoComplete="url"
            onChange={(event) =>
              setProfileDraft((prev) => ({ ...prev, avatar_url: event.target.value }))
            }
          />
          {avatarUrlError ? (
            <p className="text-xs text-destructive">{avatarUrlError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Paste a direct public image URL. Leave blank to use initials.
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={() => void onSaveProfile()}
          disabled={saving || !canSaveProfile}
        >
          <WandSparkles className="size-4" />
          Save profile
        </Button>
      </CardContent>
    </Card>
  );
}
