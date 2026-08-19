"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { emitOpenPublicProfile } from "@/lib/social/public-profile-events";

function resolveInitials({
  displayName,
  username,
}: {
  displayName: string | null;
  username: string | null;
}) {
  const source = (displayName ?? username ?? "").trim();
  if (!source) {
    return "??";
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  avatarUrl,
  displayName,
  username,
  size = "default",
  alt,
  profileSubjectUserId,
  onClick,
  buttonLabel,
}: {
  avatarUrl: string | null;
  displayName: string | null;
  username: string | null;
  size?: "default" | "sm" | "lg";
  alt?: string;
  profileSubjectUserId?: string | null;
  onClick?: () => void;
  buttonLabel?: string;
}) {
  const initials = resolveInitials({ displayName, username });
  const normalizedUrl = avatarUrl?.trim() ? avatarUrl.trim() : null;
  const normalizedSubjectUserId = profileSubjectUserId?.trim()
    ? profileSubjectUserId.trim()
    : null;
  const isInteractive = normalizedSubjectUserId !== null || Boolean(onClick);
  const resolvedButtonLabel =
    buttonLabel ??
    `${displayName ?? username ?? "User"} profile`;

  const avatar = (
    <Avatar size={size}>
      {normalizedUrl ? <AvatarImage src={normalizedUrl} alt={alt ?? "Profile avatar"} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );

  if (!isInteractive) {
    return avatar;
  }

  return (
    <button
      type="button"
      className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={resolvedButtonLabel}
      onClick={() => {
        onClick?.();
        if (normalizedSubjectUserId) {
          emitOpenPublicProfile(normalizedSubjectUserId);
        }
      }}
    >
      {avatar}
    </button>
  );
}
