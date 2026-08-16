"use client";

import { WandSparkles } from "lucide-react";
import type {
  PlannerPrimaryTabPreference,
} from "@cadence/shared/navigation/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Profile } from "@/lib/goals/types";

interface ProfileDraft {
  username: string;
  display_name: string;
  avatar_url: string;
  planner_primary_tab: PlannerPrimaryTabPreference;
}

interface ProfileSectionProps {
  profile: Profile | null;
  profileDraft: ProfileDraft;
  authEmail: string;
  saving: boolean;
  canSaveProfile: boolean;
  setProfileDraft: (updater: (previous: ProfileDraft) => ProfileDraft) => void;
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
            {avatarPreviewUrl ? (
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
