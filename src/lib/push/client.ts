import { requestJson } from "@/lib/api/client";

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

export async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
}

export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  await requestJson<{ success: boolean }, Record<string, unknown>>({
    path: "/api/push/subscriptions",
    method: "POST",
    body: subscription.toJSON() as Record<string, unknown>,
  });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await requestJson<{ success: boolean }, { endpoint: string }>({
    path: "/api/push/subscriptions",
    method: "DELETE",
    body: { endpoint },
  });
}

export async function unsubscribeCurrentBrowser(): Promise<void> {
  if (!isPushSupported()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  try {
    await removePushSubscription(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}
