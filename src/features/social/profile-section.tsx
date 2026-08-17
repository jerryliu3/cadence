"use client";

import { useRef, useState } from "react";
import { WandSparkles } from "lucide-react";
import type {
  PlannerPrimaryTabPreference,
} from "@cadence/shared/navigation/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import type { Profile } from "@/lib/goals/types";

interface ProfileDraft {
  username: string;
  display_name: string;
  avatar_url: string;
  planner_primary_tab: PlannerPrimaryTabPreference;
  social_activity_visible: boolean;
}

interface ProfileSectionProps {
  profile: Profile | null;
  profileDraft: ProfileDraft;
  authEmail: string;
  saving: boolean;
  canSaveProfile: boolean;
  setProfileDraft: (updater: (previous: ProfileDraft) => ProfileDraft) => void;
  onSaveProfile: () => Promise<void>;
  onUploadAvatar: (file: File) => Promise<void>;
}

export function ProfileSection({
  profile,
  profileDraft,
  authEmail,
  saving,
  canSaveProfile,
  setProfileDraft,
  onSaveProfile,
  onUploadAvatar,
}: ProfileSectionProps) {
  const avatarPreviewUrl = profileDraft.avatar_url.trim();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  return (
    <Card className="overflow-visible shadow-sm">
      <CardHeader>
        <CardTitle>Account profile</CardTitle>
        <CardDescription>Username is used for sharing and invites.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <UserAvatar
            avatarUrl={avatarPreviewUrl || null}
            displayName={profileDraft.display_name || profile?.display_name || null}
            username={profileDraft.username || profile?.username || null}
            alt="Profile avatar preview"
          />
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Keep this profile updated so collaborators can find you quickly.
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                setUploadingAvatar(true);
                void onUploadAvatar(file).finally(() => {
                  setUploadingAvatar(false);
                  event.currentTarget.value = "";
                });
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAvatar || saving}
                onClick={() => avatarInputRef.current?.click()}
              >
                {uploadingAvatar ? "Uploading..." : "Upload photo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAvatar || saving || avatarPreviewUrl.length === 0}
                onClick={() =>
                  setProfileDraft((prev) => ({
                    ...prev,
                    avatar_url: "",
                  }))
                }
              >
                Remove photo
              </Button>
            </div>
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
