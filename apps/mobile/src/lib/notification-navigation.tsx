import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { useSession } from "./session";

export function normalizeNotificationPath(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "/";
  }
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return null;
  }

  const pathname = value.split(/[?#]/, 1)[0] ?? "";
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decodedPathname.split("/").some((segment) => segment === "..")) {
    return null;
  }
  return value;
}

function navigateFromResponse(response: Notifications.NotificationResponse) {
  const path = normalizeNotificationPath(
    response.notification.request.content.data?.url
  );
  if (path) {
    router.push(path as Href);
  }
}

export function NotificationNavigation() {
  const { ready, session } = useSession();
  const coldStartConsumed = useRef(false);

  useEffect(() => {
    if (!ready || !session) {
      return;
    }

    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        navigateFromResponse
      );

    if (!coldStartConsumed.current) {
      coldStartConsumed.current = true;
      void Notifications.getLastNotificationResponseAsync()
        .then(async (response) => {
          if (response) {
            navigateFromResponse(response);
          }
          await Notifications.clearLastNotificationResponseAsync();
        })
        .catch(() => undefined);
    }

    return () => subscription.remove();
  }, [ready, session]);

  return null;
}
