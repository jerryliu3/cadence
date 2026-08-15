import { Platform } from "react-native";
import type { HealthConnectBridge } from "./android-health-connect";
import type { HealthKitBridge } from "./ios-healthkit";

export function nativeHealthProvider():
  | "apple_healthkit"
  | "android_health_connect"
  | null {
  if (Platform.OS === "ios") {
    return "apple_healthkit";
  }
  if (Platform.OS === "android") {
    return "android_health_connect";
  }
  return null;
}

export async function createNativeHealthKitBridge(): Promise<HealthKitBridge | null> {
  if (Platform.OS !== "ios") {
    return null;
  }
  try {
    const healthkit = (await import("@kingstinct/react-native-healthkit")) as unknown as HealthKitBridge;
    return {
      requestAuthorization: (input) => healthkit.requestAuthorization(input),
      queryQuantitySamplesWithAnchor: (type, options) =>
        healthkit.queryQuantitySamplesWithAnchor(type, options),
      enableBackgroundDelivery: (type, frequency) =>
        healthkit.enableBackgroundDelivery(type, frequency),
      subscribeToChanges: (type, onChange) =>
        healthkit.subscribeToChanges(type, onChange),
    };
  } catch {
    return null;
  }
}

export async function createNativeHealthConnectBridge(): Promise<HealthConnectBridge | null> {
  if (Platform.OS !== "android") {
    return null;
  }
  try {
    const healthConnect = (await import("react-native-health-connect")) as unknown as HealthConnectBridge;
    return {
      initialize: () => healthConnect.initialize(),
      requestPermission: (permissions) =>
        healthConnect.requestPermission(permissions),
      getChanges: (input) => healthConnect.getChanges(input),
      readRecords: (recordType, options) =>
        healthConnect.readRecords(recordType, options),
    };
  } catch {
    return null;
  }
}
