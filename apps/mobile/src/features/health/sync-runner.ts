import {
  collectHealthConnectSamples,
  type HealthConnectBridge,
} from "./android-health-connect";
import {
  collectHealthKitSamples,
  enableHealthKitBackgroundDelivery,
  type HealthKitBridge,
} from "./ios-healthkit";
import {
  deviceLocalToday,
  loadHealthConnectChangesToken,
  loadHealthKitAnchors,
  postHealthSamples,
  saveHealthConnectChangesToken,
  saveHealthKitAnchors,
} from "./sync-client";

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
  });
  await saveHealthKitAnchors(collected.nextAnchors);
}

export async function syncHealthConnect(bridge: HealthConnectBridge) {
  const token = await loadHealthConnectChangesToken();
  const collected = await collectHealthConnectSamples(bridge, token);
  await postHealthSamples({
    provider: "android_health_connect",
    permissionPrompted: true,
    localToday: deviceLocalToday(),
    samples: collected.samples,
  });
  if (collected.nextChangesToken) {
    await saveHealthConnectChangesToken(collected.nextChangesToken);
  }
}
