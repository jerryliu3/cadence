import AsyncStorage from "@react-native-async-storage/async-storage";
import { configureTabDataCacheStorage } from "@cadence/shared/cache/tab-data-cache";
import { configureMobileHaptics } from "./haptics";

const TAB_DATA_CACHE_STORAGE_PREFIX = "tab-data-cache:v1";
const memory = new Map<string, string>();

async function hydrateTabDataCacheStorage() {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((key) =>
    key.startsWith(`${TAB_DATA_CACHE_STORAGE_PREFIX}:`)
  );
  if (cacheKeys.length === 0) {
    return;
  }
  const pairs = await AsyncStorage.multiGet(cacheKeys);
  for (const [key, value] of pairs) {
    if (key && value) {
      memory.set(key, value);
    }
  }
}

function createAsyncStorageAdapter() {
  return {
    getItem(key: string) {
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
      void AsyncStorage.setItem(key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
      void AsyncStorage.removeItem(key);
    },
    getAllKeys() {
      return Array.from(memory.keys());
    },
  };
}

export function bootstrapMobilePlatform() {
  configureMobileHaptics();
  configureTabDataCacheStorage(createAsyncStorageAdapter());
  void hydrateTabDataCacheStorage();
}
