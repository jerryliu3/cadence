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
