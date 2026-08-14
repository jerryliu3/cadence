import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../lib/api";
import type { HealthKitQuantityType } from "./ios-healthkit";
import { toIngestSample } from "./ingest-payload";

const ANCHOR_KEY = "cadence.health.healthkit.anchors.v1";

export async function loadHealthKitAnchors(): Promise<
  Partial<Record<HealthKitQuantityType, string>>
> {
  const raw = await AsyncStorage.getItem(ANCHOR_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Partial<Record<HealthKitQuantityType, string>>;
  } catch {
    return {};
  }
}

export async function saveHealthKitAnchors(
  anchors: Partial<Record<HealthKitQuantityType, string>>
) {
  await AsyncStorage.setItem(ANCHOR_KEY, JSON.stringify(anchors));
}

export async function postHealthSamples(input: {
  provider: "apple_healthkit" | "android_health_connect";
  permissionPrompted?: boolean;
  samples: ReturnType<typeof toIngestSample>[];
}) {
  return api.postJson("/api/health/samples", input);
}
