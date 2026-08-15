import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api";

const NATIVE_PUSH_REGISTRATION_KEY = "cadence.native-push-registration";

interface StoredNativePushRegistration {
  platform: "ios" | "android";
  token: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function readExpoProjectId() {
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    null;
  return typeof projectId === "string" && projectId.trim().length > 0
    ? projectId.trim()
    : null;
}

export function isNativePushConfigured() {
  return readExpoProjectId() !== null;
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") {
    return;
  }
  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2F6FDB",
  });
}

export async function registerNativePush() {
  const projectId = readExpoProjectId();
  if (!projectId) {
    throw new Error("Push is not configured for this build.");
  }
  if (!Device.isDevice) {
    throw new Error("Push requires a physical device.");
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Notification permission was not granted.");
  }
  await ensureAndroidNotificationChannel();
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await api.postJson("/api/push/subscriptions", {
    platform,
    token: token.data,
  });
  await AsyncStorage.setItem(
    NATIVE_PUSH_REGISTRATION_KEY,
    JSON.stringify({ platform, token: token.data })
  );
  return token.data;
}

async function readStoredNativePushRegistration() {
  const value = await AsyncStorage.getItem(NATIVE_PUSH_REGISTRATION_KEY);
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredNativePushRegistration>;
    if (
      (parsed.platform === "ios" || parsed.platform === "android") &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0
    ) {
      return parsed as StoredNativePushRegistration;
    }
  } catch {
    // Invalid local state is cleared by unregisterNativePush.
  }
  return null;
}

export async function unregisterNativePush() {
  let cleanupFailed = false;
  let registration: StoredNativePushRegistration | null = null;
  try {
    registration = await readStoredNativePushRegistration();
  } catch {
    cleanupFailed = true;
  }

  if (registration) {
    try {
      await api.requestJson({
        path: "/api/push/subscriptions",
        method: "DELETE",
        body: registration,
      });
    } catch {
      cleanupFailed = true;
    }
  }

  try {
    await Notifications.unregisterForNotificationsAsync();
  } catch {
    cleanupFailed = true;
  }

  try {
    await AsyncStorage.removeItem(NATIVE_PUSH_REGISTRATION_KEY);
  } catch {
    cleanupFailed = true;
  }

  if (cleanupFailed) {
    throw new Error("Could not fully unregister push notifications.");
  }
}
