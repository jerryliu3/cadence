import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  shouldClampDuoScopePreference,
  type DuoAvailability,
  type DuoScope,
} from "@cadence/shared/social/duo";

const STORAGE_PREFIX = "mobile:duo:scope";

export interface DuoScopeStorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export function createDuoScopePreferenceStorageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function parseStoredDuoScopePreference(rawValue: string | null): DuoScope | null {
  if (rawValue === "me" || rawValue === "partner" || rawValue === "both") {
    return rawValue;
  }
  return null;
}

export function shouldClearStoredScopePreference({
  socialEnabled,
  availability,
  hasActivePartner,
  scopePreference,
}: {
  socialEnabled: boolean;
  availability: DuoAvailability;
  hasActivePartner: boolean;
  scopePreference: DuoScope | null;
}) {
  if (!socialEnabled) {
    return false;
  }
  return shouldClampDuoScopePreference({
    availability,
    hasActivePartner,
    scopePreference,
  });
}

export async function loadStoredDuoScopePreference({
  userId,
  storage = AsyncStorage,
}: {
  userId: string | null;
  storage?: DuoScopeStorageAdapter;
}) {
  if (!userId) {
    return null;
  }
  const rawValue = await storage.getItem(createDuoScopePreferenceStorageKey(userId));
  return parseStoredDuoScopePreference(rawValue);
}

export async function saveStoredDuoScopePreference({
  userId,
  scopePreference,
  storage = AsyncStorage,
}: {
  userId: string | null;
  scopePreference: DuoScope | null;
  storage?: DuoScopeStorageAdapter;
}) {
  if (!userId) {
    return;
  }
  const key = createDuoScopePreferenceStorageKey(userId);
  if (!scopePreference) {
    await storage.removeItem(key);
    return;
  }
  await storage.setItem(key, scopePreference);
}
