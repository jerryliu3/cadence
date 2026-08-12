const TAB_DATA_CACHE_STORAGE_PREFIX = "tab-data-cache:v1:";
export const TAB_DATA_CACHE_TTL_MS = 30 * 60 * 1000;

interface TabDataCacheRecord<TValue> {
  expiresAt: number;
  value: TValue;
}

const tabDataCache = new Map<string, TabDataCacheRecord<unknown>>();

function buildStorageKey(cacheKey: string) {
  return `${TAB_DATA_CACHE_STORAGE_PREFIX}${cacheKey}`;
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
}

export function resetTabDataCacheForTests() {
  tabDataCache.clear();
}
