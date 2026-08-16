export type DuoScope = "me" | "partner" | "both";
export type DuoAvailability = "ready" | "unavailable";

export interface DuoActivePartner {
  teamId: string;
  partnerId: string;
  partnerUsername: string | null;
  partnerDisplayName: string | null;
  partnerAvatarUrl: string | null;
}

export interface DuoPendingInvite {
  teamId: string;
  partnerId: string;
  partnerUsername: string | null;
  partnerDisplayName: string | null;
  partnerAvatarUrl: string | null;
  isIncoming: boolean;
}

export interface DuoContextState {
  activePartner: DuoActivePartner | null;
  pendingInvite: DuoPendingInvite | null;
}

export interface DuoContextLoadResult {
  state: DuoContextState;
  availability: DuoAvailability;
}

export const DUO_SURFACE_DEFAULTS = {
  insights: "me",
  checklist: "me",
  calendar: "me",
} as const satisfies Record<string, DuoScope>;

export type DuoSurfaceName = keyof typeof DUO_SURFACE_DEFAULTS;

export function shouldClampDuoScopePreference({
  availability,
  hasActivePartner,
  scopePreference,
}: {
  availability: DuoAvailability;
  hasActivePartner: boolean;
  scopePreference: DuoScope | null;
}) {
  return (
    availability === "ready" &&
    !hasActivePartner &&
    scopePreference !== null &&
    scopePreference !== "me"
  );
}

export function resolveEffectiveDuoScope({
  availability,
  hasActivePartner,
  scopePreference,
  surfaceDefault,
}: {
  availability: DuoAvailability;
  hasActivePartner: boolean;
  scopePreference: DuoScope | null;
  surfaceDefault: DuoScope;
}) {
  const effectiveHasPartner = availability === "ready" && hasActivePartner;
  return {
    hasActivePartner: effectiveHasPartner,
    scope: effectiveHasPartner ? (scopePreference ?? surfaceDefault) : ("me" as const),
  };
}

export interface DuoLaneSubject {
  id: "viewer" | "partner";
  label: string;
  userId?: string;
  readOnly: boolean;
  avatarUrl?: string | null;
}

export function resolveDuoLanes({
  scope,
  viewer,
  partner,
}: {
  scope: DuoScope;
  viewer: DuoLaneSubject;
  partner: DuoLaneSubject | null;
}): DuoLaneSubject[] {
  if (scope === "partner") {
    return partner ? [partner] : [viewer];
  }
  if (scope === "both") {
    return partner ? [viewer, partner] : [viewer];
  }
  return [viewer];
}
