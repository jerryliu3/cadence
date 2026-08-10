"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { resolveUserTimezone } from "@/lib/dates/timezone";
import {
  getPushRegistration,
  isPushSupported,
  removePushSubscription,
  savePushSubscription,
  urlBase64ToUint8Array,
} from "@/lib/push/client";
import type { PushStatus } from "@/features/settings/notification-push-section";

interface UseNotificationPushArgs {
  vapidPublicKey: string;
  onDetectedTimezone: (timezone: string) => void;
}

export function useNotificationPush({
  vapidPublicKey,
  onDetectedTimezone,
}: UseNotificationPushArgs) {
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null);
  const [changingPushStatus, setChangingPushStatus] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const initializePush = useCallback(async () => {
    await Promise.resolve();

    const detectedTimezone = resolveUserTimezone();
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    onDetectedTimezone(detectedTimezone);
    setIsIOS(ios);
    setIsStandalone(standalone);

    if (!isPushSupported()) {
      setPushStatus("unsupported");
      return;
    }

    if (!vapidPublicKey) {
      setPushStatus("not-configured");
      return;
    }

    if (Notification.permission === "denied") {
      setPushStatus("denied");
      return;
    }

    try {
      const registration = await getPushRegistration();
      const existingSubscription = await registration.pushManager.getSubscription();

      if (!existingSubscription) {
        setPushStatus("unsubscribed");
        return;
      }

      setPushSubscription(existingSubscription);
      try {
        await savePushSubscription(existingSubscription);
        setPushStatus("subscribed");
      } catch (error) {
        console.error("Failed to sync the existing push subscription:", error);
        setPushStatus("subscription-error");
      }
    } catch (error) {
      console.error("Failed to initialize push notifications:", error);
      setPushStatus("not-configured");
    }
  }, [onDetectedTimezone, vapidPublicKey]);

  const enablePush = useCallback(async () => {
    setChangingPushStatus(true);

    try {
      const registration = await getPushRegistration();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      try {
        await savePushSubscription(subscription);
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }

      setPushSubscription(subscription);
      setPushStatus("subscribed");
      toast.success("Push notifications enabled on this device.");
    } catch (error) {
      if (Notification.permission === "denied") {
        setPushStatus("denied");
        toast.error("Notification permission was denied. Enable it in your device settings.");
      } else {
        console.error("Failed to enable push notifications:", error);
        toast.error(error instanceof Error ? error.message : "Could not enable push notifications.");
      }
    } finally {
      setChangingPushStatus(false);
    }
  }, [vapidPublicKey]);

  const disablePush = useCallback(async () => {
    if (!pushSubscription) {
      return;
    }

    setChangingPushStatus(true);

    try {
      let serverCleanupFailed = false;

      try {
        await removePushSubscription(pushSubscription.endpoint);
      } catch (error) {
        serverCleanupFailed = true;
        console.error("Failed to remove the stored push subscription:", error);
      }

      await pushSubscription.unsubscribe();
      setPushSubscription(null);
      setPushStatus("unsubscribed");

      if (serverCleanupFailed) {
        toast.warning("Notifications are off. Server cleanup will finish automatically.");
      } else {
        toast.success("Push notifications disabled on this device.");
      }
    } catch (error) {
      console.error("Failed to disable push notifications:", error);
      toast.error(error instanceof Error ? error.message : "Could not disable push notifications.");
    } finally {
      setChangingPushStatus(false);
    }
  }, [pushSubscription]);

  return {
    pushStatus,
    pushSubscription,
    changingPushStatus,
    isIOS,
    isStandalone,
    initializePush,
    enablePush,
    disablePush,
  };
}
