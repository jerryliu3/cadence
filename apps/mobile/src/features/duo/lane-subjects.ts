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
}: {
  avatarUrl?: string | null;
} = {}): DuoLaneSubject {
  const normalizedAvatarUrl = avatarUrl?.trim() ? avatarUrl.trim() : null;
  return normalizedAvatarUrl
    ? { ...VIEWER_LANE_BASE, avatarUrl: normalizedAvatarUrl }
    : { ...VIEWER_LANE_BASE };
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
}: {
  scope: DuoScope;
  activePartner: DuoActivePartner | null;
  viewerAvatarUrl?: string | null;
}): DuoLaneSubject[] {
  return resolveDuoLanes({
    scope,
    viewer: viewerLaneSubject({ avatarUrl: viewerAvatarUrl }),
    partner: partnerLaneSubject(activePartner),
  });
}
