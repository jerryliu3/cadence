import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useSession } from "../../lib/session";
import {
  createNativeHealthConnectBridge,
  createNativeHealthKitBridge,
  nativeHealthProvider,
} from "./native-bridges";
import { isHealthAutoSyncEnabled } from "./sync-client";
import {
  subscribeHealthKitChanges,
  syncAppleHealth,
  syncHealthConnect,
} from "./sync-runner";

const DEBOUNCE_MS = 5_000;

export function HealthSyncLifecycle() {
  const { ready, userId } = useSession();
  const syncing = useRef(false);

  useEffect(() => {
    if (!ready || !userId) {
      return;
    }

    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const runSync = async () => {
      if (cancelled || syncing.current) {
        return;
      }
      if (!(await isHealthAutoSyncEnabled())) {
        return;
      }
      const provider = nativeHealthProvider();
      syncing.current = true;
      try {
        if (provider === "apple_healthkit") {
          const bridge = await createNativeHealthKitBridge();
          if (!bridge || cancelled) {
            return;
          }
          await syncAppleHealth(bridge);
        } else if (provider === "android_health_connect") {
          const bridge = await createNativeHealthConnectBridge();
          if (!bridge || cancelled) {
            return;
          }
          await syncHealthConnect(bridge);
        }
      } catch {
        // Failures are recorded by the sync runner / Settings resync path.
      } finally {
        syncing.current = false;
      }
    };

    const scheduleSync = () => {
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(() => {
        void runSync();
      }, DEBOUNCE_MS);
    };

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runSync();
      }
    });

    void (async () => {
      if (!(await isHealthAutoSyncEnabled()) || cancelled) {
        return;
      }
      const provider = nativeHealthProvider();
      if (provider === "apple_healthkit") {
        const bridge = await createNativeHealthKitBridge();
        if (!bridge || cancelled) {
          return;
        }
        unsubscribe = subscribeHealthKitChanges(bridge, scheduleSync);
      }
      await runSync();
    })();

    return () => {
      cancelled = true;
      if (debounce) {
        clearTimeout(debounce);
      }
      unsubscribe?.();
      appState.remove();
    };
  }, [ready, userId]);

  return null;
}
