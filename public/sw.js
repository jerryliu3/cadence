self.KNOWN_APP_PREFIXES = ["/social", "/checklist", "/calendar"];

function mapAppNotificationUrl(requestedUrl) {
  const targetUrl = new URL(requestedUrl, self.location.origin);

  if (targetUrl.origin !== self.location.origin) {
    return new URL("/app", self.location.origin);
  }

  if (targetUrl.pathname === "/" || targetUrl.pathname.length === 0) {
    targetUrl.pathname = "/app";
    return targetUrl;
  }

  if (targetUrl.pathname === "/app" || targetUrl.pathname.startsWith("/app/")) {
    return targetUrl;
  }

  const matchedPrefix = self.KNOWN_APP_PREFIXES.find((prefix) =>
    targetUrl.pathname.startsWith(prefix)
  );
  if (matchedPrefix) {
    targetUrl.pathname = `/app${targetUrl.pathname}`;
  }
  return targetUrl;
}

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload;

  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const title = payload.title || "Goalmaxxing";
  const options = {
    body: payload.body || "Complete your checklist for today",
    icon: payload.icon || "/cadence-icon.svg",
    badge: payload.badge || "/cadence-icon.svg",
    tag: payload.tag,
    data: {
      url: payload.url || "/app",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const requestedUrl = event.notification.data?.url || "/app";
  const targetUrl = mapAppNotificationUrl(requestedUrl);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existingClient = windowClients.find((client) => {
          const clientUrl = new URL(client.url);
          return clientUrl.origin === targetUrl.origin;
        });

        if (existingClient) {
          return existingClient.focus().then(() => existingClient.navigate(targetUrl.href));
        }

        return self.clients.openWindow(targetUrl.href);
      })
  );
});
