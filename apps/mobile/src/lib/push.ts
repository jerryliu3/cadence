import { Platform } from "react-native";
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

export async function registerNativePush() {
  if (!Device.isDevice) {
    throw new Error("Push requires a physical device.");
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Notification permission was not granted.");
  }
  const token = await Notifications.getExpoPushTokenAsync();
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
