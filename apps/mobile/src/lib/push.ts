import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function readExpoProjectId() {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    null
  );
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
  if (!Device.isDevice) {
    throw new Error("Push requires a physical device.");
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Notification permission was not granted.");
  }
  await ensureAndroidNotificationChannel();
  const projectId = readExpoProjectId();
  if (!projectId) {
    throw new Error(
      "Set extra.eas.projectId (EAS project id) before registering push."
    );
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await api.postJson("/api/push/subscriptions", {
    platform,
    token: token.data,
  });
  return token.data;
}

export function subscribeNotificationOpens(
  onUrl: (url: string) => void
) {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string" && url.length > 0) {
        onUrl(url);
      }
    }
  );
  return () => subscription.remove();
}
