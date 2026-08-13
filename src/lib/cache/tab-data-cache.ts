const TAB_DATA_CACHE_STORAGE_PREFIX = "tab-data-cache:v1";
const DEFAULT_TAB_DATA_CACHE_SCOPE = "anonymous";
export const TAB_DATA_CACHE_TTL_MS = 5 * 60 * 1000;

interface TabDataCacheRecord<TValue> {
  expiresAt: number;
  value: TValue;
}

const tabDataCache = new Map<string, TabDataCacheRecord<unknown>>();
let tabDataCacheScope = DEFAULT_TAB_DATA_CACHE_SCOPE;

function isBrowser() {
  return typeof window !== "undefined";
}

function sessionStorageGet(key: string) {
  if (!isBrowser()) {
    return null;
  }
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionStorageSet(key: string, value: string) {
  if (!isBrowser()) {
    return;
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore quota/private-mode failures and continue with memory cache.
  }
}

function sessionStorageRemove(key: string) {
  if (!isBrowser()) {
    return;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function sessionStorageKeys() {
  if (!isBrowser()) {
    return [] as string[];
  }
  try {
    return Array.from(
      { length: window.sessionStorage.length },
      (_, index) => window.sessionStorage.key(index) ?? ""
    ).filter((key) => key.length > 0);
  } catch {
    return [];
  }
}

function buildStorageKey(cacheKey: string) {
  return `${TAB_DATA_CACHE_STORAGE_PREFIX}:${tabDataCacheScope}:${cacheKey}`;
}

function normalizeTabDataCacheScope(scope: string | null | undefined) {
  const normalized = scope?.trim();
  return normalized && normalized.length > 0
    ? normalized
    : DEFAULT_TAB_DATA_CACHE_SCOPE;
}

function readPersistentRecord<TValue>(cacheKey: string) {
  try {
    const raw = sessionStorageGet(buildStorageKey(cacheKey));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as TabDataCacheRecord<TValue> | null;
    if (!parsed || parsed.expiresAt < Date.now()) {
      sessionStorageRemove(buildStorageKey(cacheKey));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersistentRecord<TValue>(
  cacheKey: string,
  record: TabDataCacheRecord<TValue>
) {
  sessionStorageSet(buildStorageKey(cacheKey), JSON.stringify(record));
}

function removePersistentRecord(cacheKey: string) {
  sessionStorageRemove(buildStorageKey(cacheKey));
}

function purgePersistentStorageForOtherScopes(activeScope: string) {
  const storagePrefix = `${TAB_DATA_CACHE_STORAGE_PREFIX}:`;
  const activeScopePrefix = `${storagePrefix}${activeScope}:`;
  for (const storageKey of sessionStorageKeys()) {
    if (!storageKey.startsWith(storagePrefix)) {
      continue;
    }
    if (!storageKey.startsWith(activeScopePrefix)) {
      sessionStorageRemove(storageKey);
    }
  }
}

export function readTabDataCache<TValue>(cacheKey: string) {
  const inMemory = tabDataCache.get(cacheKey) as
    | TabDataCacheRecord<TValue>
    | undefined;
  if (inMemory) {
    if (inMemory.expiresAt >= Date.now()) {
      return inMemory.value;
    }
    tabDataCache.delete(cacheKey);
    removePersistentRecord(cacheKey);
  }

  const fromStorage = readPersistentRecord<TValue>(cacheKey);
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
  writePersistentRecord(cacheKey, record);
}

export function invalidateTabDataCache(cacheKey: string) {
  tabDataCache.delete(cacheKey);
  removePersistentRecord(cacheKey);
}

export function invalidateTabDataCacheByPrefix(prefix: string) {
  for (const key of tabDataCache.keys()) {
    if (key.startsWith(prefix)) {
      tabDataCache.delete(key);
      removePersistentRecord(key);
    }
  }
  const storagePrefix = buildStorageKey(prefix);
  for (const storageKey of sessionStorageKeys()) {
    if (storageKey.startsWith(storagePrefix)) {
      sessionStorageRemove(storageKey);
    }
  }
}

export function setTabDataCacheScope(scope: string | null | undefined) {
  if (!isBrowser()) {
    return;
  }
  const nextScope = normalizeTabDataCacheScope(scope);
  if (tabDataCacheScope === nextScope) {
    return;
  }
  tabDataCacheScope = nextScope;
  tabDataCache.clear();
  purgePersistentStorageForOtherScopes(nextScope);
}

export function resetTabDataCacheForTests() {
  tabDataCache.clear();
  tabDataCacheScope = DEFAULT_TAB_DATA_CACHE_SCOPE;
  for (const storageKey of sessionStorageKeys()) {
    if (storageKey.startsWith(`${TAB_DATA_CACHE_STORAGE_PREFIX}:`)) {
      sessionStorageRemove(storageKey);
    }
  }
}
