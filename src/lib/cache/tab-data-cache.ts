import {
  configureTabDataCacheStorage,
  invalidateTabDataCache,
  invalidateTabDataCacheByPrefix,
  readTabDataCache,
  resetTabDataCacheForTests as resetSharedTabDataCacheForTests,
  setTabDataCacheScope as setSharedTabDataCacheScope,
  TAB_DATA_CACHE_TTL_MS,
  writeTabDataCache,
  type TabDataCacheStorage,
} from "@cadence/shared/cache/tab-data-cache";

function isBrowser() {
  return typeof window !== "undefined";
}

function createSessionStorageAdapter(): TabDataCacheStorage {
  return {
    getItem(key) {
      if (!isBrowser()) {
        return null;
      }
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      if (!isBrowser()) {
        return;
      }
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        // Ignore quota/private-mode failures.
      }
    },
    removeItem(key) {
      if (!isBrowser()) {
        return;
      }
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Ignore storage failures.
      }
    },
    getAllKeys() {
      if (!isBrowser()) {
        return [];
      }
      try {
        return Array.from(
          { length: window.sessionStorage.length },
          (_, index) => window.sessionStorage.key(index) ?? ""
        ).filter((key) => key.length > 0);
      } catch {
        return [];
      }
    },
  };
}

export function configureWebTabDataCache() {
  configureTabDataCacheStorage(createSessionStorageAdapter());
}

export {
  invalidateTabDataCache,
  invalidateTabDataCacheByPrefix,
  readTabDataCache,
  TAB_DATA_CACHE_TTL_MS,
  writeTabDataCache,
};

export function setTabDataCacheScope(scope: string | null | undefined) {
  if (!isBrowser()) {
    return;
  }
  setSharedTabDataCacheScope(scope);
}

export function resetTabDataCacheForTests() {
  resetSharedTabDataCacheForTests();
}
