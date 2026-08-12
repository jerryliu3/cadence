const TAB_DATA_CACHE_STORAGE_PREFIX = "tab-data-cache:v1";
const DEFAULT_TAB_DATA_CACHE_SCOPE = "anonymous";
export const TAB_DATA_CACHE_TTL_MS = 5 * 60 * 1000;

interface TabDataCacheRecord<TValue> {
  expiresAt: number;
  value: TValue;
}

const tabDataCache = new Map<string, TabDataCacheRecord<unknown>>();
let tabDataCacheScope = DEFAULT_TAB_DATA_CACHE_SCOPE;

function buildStorageKey(cacheKey: string) {
  return `${TAB_DATA_CACHE_STORAGE_PREFIX}:${tabDataCacheScope}:${cacheKey}`;
}

function normalizeTabDataCacheScope(scope: string | null | undefined) {
  const normalized = scope?.trim();
  return normalized && normalized.length > 0
    ? normalized
    : DEFAULT_TAB_DATA_CACHE_SCOPE;
}

function readSessionStorageRecord<TValue>(cacheKey: string) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(buildStorageKey(cacheKey));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as TabDataCacheRecord<TValue> | null;
    if (!parsed || parsed.expiresAt < Date.now()) {
      window.sessionStorage.removeItem(buildStorageKey(cacheKey));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionStorageRecord<TValue>(
  cacheKey: string,
  record: TabDataCacheRecord<TValue>
) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(buildStorageKey(cacheKey), JSON.stringify(record));
  } catch {
    // Ignore quota/private-mode failures and continue with memory cache.
  }
}

function removeSessionStorageRecord(cacheKey: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(buildStorageKey(cacheKey));
  } catch {
    // Ignore storage failures.
  }
}

function purgeSessionStorageForOtherScopes(activeScope: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const storagePrefix = `${TAB_DATA_CACHE_STORAGE_PREFIX}:`;
    const activeScopePrefix = `${storagePrefix}${activeScope}:`;
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = window.sessionStorage.key(index);
      if (!storageKey || !storageKey.startsWith(storagePrefix)) {
        continue;
      }
      if (!storageKey.startsWith(activeScopePrefix)) {
        window.sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Ignore storage failures.
  }
}

export function readTabDataCache<TValue>(cacheKey: string) {
  const inMemory = tabDataCache.get(cacheKey) as TabDataCacheRecord<TValue> | undefined;
  if (inMemory) {
    if (inMemory.expiresAt >= Date.now()) {
      return inMemory.value;
    }
    tabDataCache.delete(cacheKey);
    removeSessionStorageRecord(cacheKey);
  }

  const fromStorage = readSessionStorageRecord<TValue>(cacheKey);
  if (!fromStorage) {
    return null;
  }

  tabDataCache.set(cacheKey, fromStorage);
  return fromStorage.value;
}

export function writeTabDataCache<TValue>(
  cacheKey: string,
  value: TValue,
  ttlMs = TAB_DATA_CACHE_TTL_MS
) {
  const record: TabDataCacheRecord<TValue> = {
    expiresAt: Date.now() + ttlMs,
    value,
  };
  tabDataCache.set(cacheKey, record);
  writeSessionStorageRecord(cacheKey, record);
}

export function invalidateTabDataCache(cacheKey: string) {
  tabDataCache.delete(cacheKey);
  removeSessionStorageRecord(cacheKey);
}

export function invalidateTabDataCacheByPrefix(prefix: string) {
  for (const key of tabDataCache.keys()) {
    if (key.startsWith(prefix)) {
      tabDataCache.delete(key);
      removeSessionStorageRecord(key);
    }
  }
  if (typeof window === "undefined") {
    return;
  }
  try {
    const storagePrefix = buildStorageKey(prefix);
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = window.sessionStorage.key(index);
      if (storageKey && storageKey.startsWith(storagePrefix)) {
        window.sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Ignore storage failures.
  }
}

export function setTabDataCacheScope(scope: string | null | undefined) {
  if (typeof window === "undefined") {
    return;
  }
  const nextScope = normalizeTabDataCacheScope(scope);
  if (tabDataCacheScope === nextScope) {
    return;
  }
  tabDataCacheScope = nextScope;
  tabDataCache.clear();
  purgeSessionStorageForOtherScopes(nextScope);
}

export function resetTabDataCacheForTests() {
  tabDataCache.clear();
  tabDataCacheScope = DEFAULT_TAB_DATA_CACHE_SCOPE;
  if (typeof window === "undefined") {
    return;
  }
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = window.sessionStorage.key(index);
      if (
        storageKey &&
        storageKey.startsWith(`${TAB_DATA_CACHE_STORAGE_PREFIX}:`)
      ) {
        window.sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Ignore storage failures in test environments.
  }
}
