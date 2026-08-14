import {
  collectHealthConnectSamples,
  type HealthConnectBridge,
} from "./android-health-connect";
import {
  collectHealthKitSamples,
  enableHealthKitBackgroundDelivery,
  HEALTHKIT_QUANTITY_TYPES,
  type HealthKitBridge,
} from "./ios-healthkit";
import {
  deviceLocalToday,
  loadHealthConnectChangesToken,
  loadHealthKitAnchors,
  postHealthSamples,
  saveHealthConnectChangesToken,
  saveHealthKitAnchors,
  setHealthAutoSyncEnabled,
} from "./sync-client";
import {
  reportMobileHealthSyncFailure,
  reportMobileHealthTelemetry,
} from "./telemetry";

export async function reportHealthSyncFailure(
  provider: "apple_healthkit" | "android_health_connect",
  error: unknown
) {
  const message =
    error instanceof Error ? error.message.slice(0, 500) : "Health sync failed.";
  await postHealthSamples({
    provider,
    permissionPrompted: true,
    lastError: message,
    samples: [],
  });
  reportMobileHealthSyncFailure(error, { provider });
}

export async function syncAppleHealth(bridge: HealthKitBridge) {
  const anchors = await loadHealthKitAnchors();
  const collected = await collectHealthKitSamples(bridge, anchors);
  await enableHealthKitBackgroundDelivery(bridge);
  await postHealthSamples({
    provider: "apple_healthkit",
    permissionPrompted: true,
    localToday: deviceLocalToday(),
    samples: collected.samples,
    deletedNativeIds: collected.deletedNativeIds,
  });
  await saveHealthKitAnchors(collected.nextAnchors);
  await setHealthAutoSyncEnabled(true);
  reportMobileHealthTelemetry("sync_succeeded", {
    provider: "apple_healthkit",
    sampleCount: collected.samples.length,
  });
}

export async function syncHealthConnect(bridge: HealthConnectBridge) {
  const token = await loadHealthConnectChangesToken();
  const collected = await collectHealthConnectSamples(bridge, token);
  await postHealthSamples({
    provider: "android_health_connect",
    permissionPrompted: true,
    localToday: deviceLocalToday(),
    samples: collected.samples,
    deletedNativeIds: collected.deletedNativeIds,
  });
  if (collected.nextChangesToken) {
    await saveHealthConnectChangesToken(collected.nextChangesToken);
  }
  await setHealthAutoSyncEnabled(true);
  reportMobileHealthTelemetry("sync_succeeded", {
    provider: "android_health_connect",
    sampleCount: collected.samples.length,
  });
}

export function subscribeHealthKitChanges(
  bridge: HealthKitBridge,
  onChange: () => void
): () => void {
  const subscriptions = HEALTHKIT_QUANTITY_TYPES.map((type) =>
    bridge.subscribeToChanges(type, onChange)
  );
  return () => {
    for (const subscription of subscriptions) {
      subscription.remove();
    }
  };
}
