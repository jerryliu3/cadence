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

async function parseApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed with status ${response.status}.`;
}

export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const response = await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
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
