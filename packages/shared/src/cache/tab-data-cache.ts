const TAB_DATA_CACHE_STORAGE_PREFIX = "tab-data-cache:v1";
const DEFAULT_TAB_DATA_CACHE_SCOPE = "anonymous";
export const TAB_DATA_CACHE_TTL_MS = 5 * 60 * 1000;

export interface TabDataCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  getAllKeys(): string[];
}

interface TabDataCacheRecord<TValue> {
  expiresAt: number;
  value: TValue;
}

const noopStorage: TabDataCacheStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  getAllKeys: () => [],
};

const tabDataCache = new Map<string, TabDataCacheRecord<unknown>>();
let tabDataCacheScope = DEFAULT_TAB_DATA_CACHE_SCOPE;
let persistentStorage: TabDataCacheStorage = noopStorage;

export function configureTabDataCacheStorage(storage: TabDataCacheStorage) {
  persistentStorage = storage;
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
    const raw = persistentStorage.getItem(buildStorageKey(cacheKey));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as TabDataCacheRecord<TValue> | null;
    if (!parsed || parsed.expiresAt < Date.now()) {
      persistentStorage.removeItem(buildStorageKey(cacheKey));
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
  try {
    persistentStorage.setItem(buildStorageKey(cacheKey), JSON.stringify(record));
  } catch {
    // Ignore quota/private-mode failures and continue with memory cache.
  }
}

function removePersistentRecord(cacheKey: string) {
  try {
    persistentStorage.removeItem(buildStorageKey(cacheKey));
  } catch {
    // Ignore storage failures.
  }
}

function purgePersistentStorageForOtherScopes(activeScope: string) {
  try {
    const storagePrefix = `${TAB_DATA_CACHE_STORAGE_PREFIX}:`;
    const activeScopePrefix = `${storagePrefix}${activeScope}:`;
    for (const storageKey of persistentStorage.getAllKeys()) {
      if (!storageKey.startsWith(storagePrefix)) {
        continue;
      }
      if (!storageKey.startsWith(activeScopePrefix)) {
        persistentStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Ignore storage failures.
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
  try {
    const storagePrefix = buildStorageKey(prefix);
    for (const storageKey of persistentStorage.getAllKeys()) {
      if (storageKey.startsWith(storagePrefix)) {
        persistentStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Ignore storage failures.
  }
}

export function setTabDataCacheScope(scope: string | null | undefined) {
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
  try {
    for (const storageKey of persistentStorage.getAllKeys()) {
      if (storageKey.startsWith(`${TAB_DATA_CACHE_STORAGE_PREFIX}:`)) {
        persistentStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Ignore storage failures in test environments.
  }
}
