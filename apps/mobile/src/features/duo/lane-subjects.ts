import {
  resolveDuoLanes,
  type DuoActivePartner,
  type DuoLaneSubject,
  type DuoScope,
} from "@cadence/shared/social/duo";

const VIEWER_LANE_BASE = {
  id: "viewer",
  label: "Solo",
  readOnly: false,
} as const satisfies Pick<DuoLaneSubject, "id" | "label" | "readOnly">;

export function viewerLaneSubject({
  avatarUrl,
  userId,
}: {
  avatarUrl?: string | null;
  userId?: string | null;
} = {}): DuoLaneSubject {
  const normalizedAvatarUrl = avatarUrl?.trim() ? avatarUrl.trim() : null;
  const normalizedUserId = userId?.trim() ? userId.trim() : null;
  const withUser =
    normalizedUserId !== null
      ? { ...VIEWER_LANE_BASE, userId: normalizedUserId }
      : { ...VIEWER_LANE_BASE };
  return normalizedAvatarUrl
    ? { ...withUser, avatarUrl: normalizedAvatarUrl }
    : withUser;
}

export function partnerLaneSubject(
  activePartner: DuoActivePartner | null
): DuoLaneSubject | null {
  if (!activePartner) {
    return null;
  }
  return {
    id: "partner",
    label: activePartner.partnerDisplayName ?? activePartner.partnerUsername ?? "Partner",
    userId: activePartner.partnerId,
    readOnly: true,
    avatarUrl: activePartner.partnerAvatarUrl,
  };
}

export function resolveMobileDuoLaneSubjects({
  scope,
  activePartner,
  viewerAvatarUrl,
  viewerUserId,
}: {
  scope: DuoScope;
  activePartner: DuoActivePartner | null;
  viewerAvatarUrl?: string | null;
  viewerUserId?: string | null;
}): DuoLaneSubject[] {
  return resolveDuoLanes({
    scope,
    viewer: viewerLaneSubject({ avatarUrl: viewerAvatarUrl, userId: viewerUserId }),
    partner: partnerLaneSubject(activePartner),
  });
}
