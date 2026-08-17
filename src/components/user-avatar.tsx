"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
}: {
  avatarUrl: string | null;
  displayName: string | null;
  username: string | null;
  size?: "default" | "sm" | "lg";
  alt?: string;
}) {
  const initials = resolveInitials({ displayName, username });
  const normalizedUrl = avatarUrl?.trim() ? avatarUrl.trim() : null;

  return (
    <Avatar size={size}>
      {normalizedUrl ? <AvatarImage src={normalizedUrl} alt={alt ?? "Profile avatar"} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
