import {
  resolveDuoLanes,
  type DuoActivePartner,
  type DuoLaneSubject,
  type DuoScope,
} from "@cadence/shared/social/duo";

const VIEWER_LANE: DuoLaneSubject = {
  id: "viewer",
  label: "Mine",
  readOnly: false,
};

export function viewerLaneSubject(): DuoLaneSubject {
  return VIEWER_LANE;
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
}: {
  scope: DuoScope;
  activePartner: DuoActivePartner | null;
}): DuoLaneSubject[] {
  return resolveDuoLanes({
    scope,
    viewer: viewerLaneSubject(),
    partner: partnerLaneSubject(activePartner),
  });
}
